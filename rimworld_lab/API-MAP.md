> ⚠️ **自动生成内容，不要手动修改。改动请回数据源(api_catalog / tools 目录)后重新生成。**
> 生成器:tool-protocol/tools/gen_api_map.py(命令见 rimworld_lab/README.md)

# Tools ↔ API 对应关系

覆盖统计:GAME_CONTROL 5/5 · READ 15/46 · WRITE 14/29

## 读/控制工具 → 端点

| 工具 | 分发 | 端点 | 备注 |
|---|---|---|---|
| game_state | status | GET /api/v1/game/state |  |
|  | overview | GET /api/v1/game/state + GET /api/v1/colonists/detailed + GET /api/v1/ui/alerts + GET /api/v1/map/weather |  |
| map_info | summary | GET /api/v1/map/terrain + GET /api/v1/colonists/detailed + GET /api/v1/map/zones + GET /api/v1/map/rooms | summary 的选址分析为本地计算(_find_clear_rect),非端点能力 |
|  | zones | GET /api/v1/map/zones |  |
|  | rooms | GET /api/v1/map/rooms |  |
|  | buildings | GET /api/v1/map/buildings |  |
|  | power | GET /api/v1/map/power/info |  |
|  | ore | GET /api/v1/map/ore |  |
|  | weather | GET /api/v1/map/weather |  |
|  | farm | GET /api/v1/map/farm/summary |  |
| colonists | basic | GET /api/v1/colonists/detailed + GET /api/v1/colonists | detailed 端点优先,失败回退 basic 端点 |
|  | detailed | GET /api/v1/colonists/detailed + GET /api/v1/colonists |  |
|  | positions | GET /api/v1/colonists/detailed + GET /api/v1/colonists |  |
| resources | summary | GET /api/v1/resources/summary + GET /api/v1/resources/stored + GET /api/v1/map/power/info |  |
|  | stored | GET /api/v1/resources/stored |  |
| alerts | — | GET /api/v1/ui/alerts |  |
| research_info | summary | GET /api/v1/research/summary | progress 复用 summary 端点数据 |
|  | progress | GET /api/v1/research/summary |  |
|  | tree | GET /api/v1/research/tree |  |
| save_management | save | POST /api/v1/game/save | RIMAPI 无列档端点,list 不可用 |
|  | load | POST /api/v1/game/load |  |
| pause_control | pause | POST /api/v1/game/speed |  |
|  | unpause | POST /api/v1/game/speed |  |

## 写工具 → 端点(提案型,经 RLE executor 执行;名字与 WRITE_CATALOG 同名 join)

| 工具 | 端点 | catalog 描述 |
|---|---|---|
| work_priority | POST /api/v1/colonist/work-priority | Set a colonist's priority for a work type (1=highest, 4=lowest) |
| blueprint | POST /api/v1/builder/blueprint | Place building blueprints using a grid (walls, doors, beds, etc.) |
| growing_zone | POST /api/v1/map/zone/growing | Create a growing zone for food production |
| stockpile_zone | POST /api/v1/map/zone/stockpile | Create a stockpile zone for item storage |
| designate_area | POST /api/v1/order/designate/area | Designate an area for mining, harvesting, deconstructing, or hunting |
| draft | POST /api/v1/pawn/edit/status | Draft or undraft a colonist for combat |
| move | POST /api/v1/pawn/edit/position | Move a colonist to a position |
| job_assign | POST /api/v1/pawn/job | Assign a specific job to a colonist |
| time_assignment | POST /api/v1/colonist/time-assignment | Set schedule for a colonist at a specific hour |
| bed_rest | POST /api/v1/pawn/medical/bed-rest | Assign a colonist to bed rest |
| tend | POST /api/v1/pawn/medical/tend | Have a doctor tend to a patient |
| toggle_power | POST /api/v1/map/building/power | Toggle power on/off for a building |
| research_target | POST /api/v1/research/target | Set the current research target |
| research_stop | POST /api/v1/research/stop | Stop current research |

## 未覆盖端点 · GAME_CONTROL(0 个)

全部已覆盖。

## 未覆盖端点 · READ(31 个)

| 端点键 | METHOD path | 描述 |
|---|---|---|
| colonist_detailed | GET /api/v1/colonist/detailed | Single colonist full data |
| colonist_inventory | GET /api/v1/colonist/inventory | Colonist equipment and carried items |
| colonist_opinion | GET /api/v1/colonist/opinion-about | Social opinion between two colonists |
| colonists_positions | GET /api/v1/colonists/positions | All colonist positions on map |
| def_all | GET /api/v1/def/all | All game definitions (things, buildings, plants, jobs, work types) |
| faction_relations | GET /api/v1/faction/relations | Detailed faction relations |
| factions | GET /api/v1/factions | All factions with goodwill and relation status |
| incident_chance | GET /api/v1/incident/chance | Probability of a specific incident type |
| incidents | GET /api/v1/incidents | Active incidents and events |
| incidents_top | GET /api/v1/incidents/top | Most likely upcoming incidents |
| map_animals | GET /api/v1/map/animals | All animals on the map |
| map_building_info | GET /api/v1/map/building/info | Detailed info about a specific building |
| map_creatures_summary | GET /api/v1/map/creatures/summary | Summary of all creatures (colonists, animals, enemies) |
| map_growing_zone | GET /api/v1/map/zone/growing | Details of a specific growing zone |
| map_plants | GET /api/v1/map/plants | All plants on the map |
| map_things | GET /api/v1/map/things | All things (items, corpses, etc.) on the map |
| map_things_at | GET /api/v1/map/things-at | Things at a specific position |
| map_things_radius | GET /api/v1/map/things/radius | Things within a radius of a position |
| maps | GET /api/v1/maps | List of all maps |
| outfits | GET /api/v1/outfits | Outfit policies |
| quests | GET /api/v1/quests | Active quests |
| research_finished | GET /api/v1/research/finished | List of completed research projects |
| research_progress | GET /api/v1/research/progress | Current research project progress |
| research_project | GET /api/v1/research/project | Details of a specific research project |
| resources_storages | GET /api/v1/resources/storages/summary | Storage zone summaries with capacity |
| time_assignments | GET /api/v1/time-assignments | Current time assignment schedules |
| traders | GET /api/v1/traders/defs | Available trader types |
| work_list | GET /api/v1/work-list | Available work types for colonist assignment |
| world_caravans | GET /api/v1/world/caravans | Active caravans |
| world_settlements | GET /api/v1/world/settlements | All world map settlements |
| world_sites | GET /api/v1/world/sites | World map sites (quests, ruins, etc.) |

## 未覆盖端点 · WRITE(15 个)

| 端点键 | METHOD path | 描述 |
|---|---|---|
| camera_screenshot | POST /api/v1/camera/screenshot | Capture base64 map screenshot |
| change_weather | POST /api/v1/map/weather/change | Change the current weather |
| destroy_rect | POST /api/v1/map/destroy/rect | Destroy all things in a rectangular area |
| drop_pod | POST /api/v1/map/droppod | Send a drop pod with items |
| edit_health | POST /api/v1/pawn/edit/health | Heal injuries, restore body parts, cure diseases |
| edit_needs | POST /api/v1/pawn/edit/needs | Set pawn needs (food, rest, mood) to 0.0-1.0 |
| edit_skills | POST /api/v1/pawn/edit/skills | Set pawn skill levels and passions |
| edit_traits | POST /api/v1/pawn/edit/traits | Add or remove traits from a pawn |
| equip | POST /api/v1/jobs/make/equip | Make a colonist equip an item |
| repair_rect | POST /api/v1/map/repair/rect | Repair all damaged buildings in a rectangular area |
| spawn_item | POST /api/v1/item/spawn | Spawn an item on the map |
| spawn_pawn | POST /api/v1/pawn/spawn | Spawn a new pawn on the map |
| stockpile_delete | DELETE /api/v1/map/zone/stockpile/delete | Delete a stockpile zone |
| stockpile_update | POST /api/v1/map/zone/stockpile/update | Update an existing stockpile zone |
| trigger_incident | POST /api/v1/incident/trigger | Trigger a game incident (raid, toxic fallout, etc.) |

## client.py 实际 path ↔ catalog 声明(信息提示,不阻断生成)

- 客户端字面调用、catalog 未声明:8 条:/api/v1/camera/change/position, /api/v1/camera/change/zoom, /api/v1/camera/follow/pawn, /api/v1/colonist, /api/v1/dev/endpoints, /api/v1/things/set-forbidden, /api/v1/ui/window/close, /api/v1/ui/windows
- catalog 声明、client.py 无字面调用:30 条(可能经 client.call 透传或未实现,详见 api-map.json)

## 边界说明

- 分母是 api_catalog 条目数,非上游 RIMAPI 全量 166 端点;catalog 之外不在视野。
- 写侧执行真源在 RLE executor,此处为名字级对齐。
