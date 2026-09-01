"""Keyless replay tests for the vendored RimAPIClient.

Fixtures mirror the 2026-08-31 live capture shapes: RLE-encoded terrain
grid + palette behind the ``{"success": true, "data": ...}`` envelope,
``game/state`` carrying ``game_tick``. Grids are shrunk to 40×40 so the
siting expectations are hand-verifiable.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from rimapi.client import RimAPIClient
from rimapi.schemas import AreaRect


def _terrain_body(width: int, height: int, palette: list[str], grid: list[int]) -> dict:
    return {"width": width, "height": height, "palette": palette, "grid": grid}


class FakeRimAPI:
    """Route handler replaying the endpoint shapes the client consumes."""

    def __init__(self, terrain: dict[str, dict[int, Any]], game_tick: int) -> None:
        # map_id → terrain payload; order of insertion is the request order.
        self.terrain = terrain
        self.game_tick = game_tick
        self.terrain_hits: list[int] = []

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        map_id = int(request.url.params.get("map_id", "0"))
        if path == "/api/v1/map/terrain":
            self.terrain_hits.append(map_id)
            return httpx.Response(200, json={"success": True, "data": self.terrain[map_id]})
        if path == "/api/v1/game/state":
            return httpx.Response(200, json={"success": True, "data": {
                "game_tick": self.game_tick,
                "colony_wealth": 12000.0,
                "colonist_count": 3,
            }})
        if path == "/api/v1/game/load":
            return httpx.Response(200, json={"success": True})
        if path == "/api/v1/map/zones":
            return httpx.Response(200, json={"success": True, "data": {
                "zones": [{"id": 7, "zone_type": "Growing", "label": "", "cells_count": 12}],
                "areas": [],
            }})
        raise AssertionError(f"unexpected request {request.method} {path}")


def _make_client(handler: FakeRimAPI) -> RimAPIClient:
    return RimAPIClient("http://localhost:8765", transport=httpx.MockTransport(handler))


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


# 40×40, palette: 0=Soil (fertile, buildable), 1=Water.
# Water occupies flat 700..799: z=17 x=20..39, z=18 full, z=19 x=0..19.
_OPEN_GRID = {"width": 40, "height": 40, "palette": ["Soil", "Water"],
              "grid": [700, 0, 100, 1, 800, 0]}
# Water occupies flat 400..419: the z=10 row, x=0..19 — right across the
# colony center (10, 10), forcing the siting search to skip outward.
_CENTER_BLOCKED_GRID = {"width": 40, "height": 40, "palette": ["Soil", "Water"],
                        "grid": [400, 0, 20, 1, 1180, 0]}


def test_terrain_rle_decode_and_siting() -> None:
    async def main() -> None:
        api = FakeRimAPI({0: _OPEN_GRID}, game_tick=60000)
        async with _make_client(api) as client:
            summary = await client.get_terrain_summary([(10, 10)])
        assert summary is not None
        assert summary.colony_center == (10, 10)
        assert summary.recommended_shelter == AreaRect(x1=10, z1=10, x2=16, z2=16)
        assert summary.recommended_farm == AreaRect(x1=10, z1=10, x2=17, z2=17)
        assert summary.recommended_stockpile == AreaRect(x1=10, z1=10, x2=14, z2=14)
        # The water scan treats out-of-bounds as water, so the bbox is the
        # ±40 scan window around the center merged with the real water.
        assert summary.water_areas == [AreaRect(x1=-30, z1=-30, x2=50, z2=50, label="water")]
    _run(main())


def test_siting_skips_water_at_center() -> None:
    async def main() -> None:
        api = FakeRimAPI({0: _CENTER_BLOCKED_GRID}, game_tick=60000)
        async with _make_client(api) as client:
            summary = await client.get_terrain_summary([(10, 10)])
        assert summary is not None
        # Radius-0 candidate (10,10)-(16,16) crosses the z=10 water row;
        # the expanding search settles on the first clear candidate.
        assert summary.recommended_shelter == AreaRect(x1=7, z1=13, x2=13, z2=19)
    _run(main())


def test_envelope_unwrap_variants() -> None:
    unwrap = RimAPIClient._unwrap_envelope
    assert unwrap({"success": True, "data": [1, 2]}) == [1, 2]
    assert unwrap({"success": True}) == {"success": True}
    assert unwrap([1, 2]) == [1, 2]
    assert unwrap("not-a-dict") == "not-a-dict"


def test_get_zones_unwraps_envelope() -> None:
    async def main() -> None:
        api = FakeRimAPI({0: _OPEN_GRID}, game_tick=60000)
        async with _make_client(api) as client:
            zones = await client.get_zones()
        assert [z.zone_type for z in zones] == ["Growing"]
        assert zones[0].cell_count == 12
    _run(main())


def test_pin_reused_within_same_map() -> None:
    async def main() -> None:
        api = FakeRimAPI({0: _OPEN_GRID}, game_tick=60000)
        async with _make_client(api) as client:
            first = await client.get_terrain_summary([(10, 10)])
            second = await client.get_terrain_summary([(12, 12)])
        assert api.terrain_hits == [0]
        assert first is second
    _run(main())


def test_pin_invalidated_on_load() -> None:
    async def main() -> None:
        api = FakeRimAPI({0: _OPEN_GRID}, game_tick=60000)
        async with _make_client(api) as client:
            await client.get_terrain_summary([(10, 10)])
            await client.load_game("quicksave")
            await client.get_terrain_summary([(10, 10)])
        assert api.terrain_hits == [0, 0]
    _run(main())


def test_pin_invalidated_on_tick_regression() -> None:
    async def main() -> None:
        api = FakeRimAPI({0: _OPEN_GRID}, game_tick=60000)
        async with _make_client(api) as client:
            await client.get_colony()
            await client.get_terrain_summary([(10, 10)])
            api.game_tick = 45000  # an out-of-band reload
            await client.get_colony()
            await client.get_terrain_summary([(10, 10)])
            api.game_tick = 46000  # normal forward ticks must not clear
            await client.get_colony()
            await client.get_terrain_summary([(10, 10)])
        assert api.terrain_hits == [0, 0]
    _run(main())


def test_pin_keyed_by_map_id() -> None:
    async def main() -> None:
        api = FakeRimAPI({0: _OPEN_GRID, 1: _CENTER_BLOCKED_GRID}, game_tick=60000)
        async with _make_client(api) as client:
            open_summary = await client.get_terrain_summary([(10, 10)], map_id=0)
            blocked_summary = await client.get_terrain_summary([(10, 10)], map_id=1)
            pinned_again = await client.get_terrain_summary([(10, 10)], map_id=1)
        assert api.terrain_hits == [0, 1]
        assert open_summary is not blocked_summary
        assert pinned_again is blocked_summary
    _run(main())


def test_package_surface() -> None:
    import rimapi

    assert hasattr(rimapi, "RimAPIClient")
    assert hasattr(rimapi, "RimAPISSEClient")
    assert hasattr(rimapi, "GameState")


def test_transport_param_is_optional() -> None:
    # Default construction stays proxy-hardened without a transport seam.
    client = RimAPIClient()
    assert client._client is None
