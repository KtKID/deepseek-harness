import { expect,it,vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionInputShell } from '../src/client/input/facade.ts'
const attachments={ serialize:async()=>[],release:()=>{},unsupportedNotice:()=>'' }
it('routes explicit reference identities before serialization and restores rejected drafts',async()=>{
  const sink=vi.fn(async()=>({ kind:'success' as const }))
  const structured=vi.fn(async (_draft:import('../src/client/contract/draft-editor.ts').DraftSnapshot)=>({ kind:'error' as const,text:'member unavailable' }))
  const ctx=new Context()
  const shell=new SessionInputShell({ actx:ctx,commandAttachments:attachments,defaultSink:sink,structuredSink:structured })
  shell.setDraft({ text:'@Writer task',references:[{ source:'team',ref:'role-id',label:'Writer',clipboardText:'@Writer',offset:0,length:7 }] })
  shell.submit()
  await vi.waitFor(()=>{ expect(structured).toHaveBeenCalledOnce() })
  expect(structured.mock.calls[0]?.[0]).toMatchObject({ text:'@Writer task',references:[{ source:'team',ref:'role-id' }] })
  await vi.waitFor(()=>{ expect(shell.snapshot.draft).toBe('@Writer task') })
  expect(sink).not.toHaveBeenCalled();shell.dispose();await ctx.fiber.dispose()
})
it('delegates ordinary submissions after an optional structured handler',async()=>{
  const sink=vi.fn(async()=>({ kind:'success' as const }));const ctx=new Context()
  const shell=new SessionInputShell({ actx:ctx,commandAttachments:attachments,defaultSink:sink,structuredSink:async()=>undefined })
  shell.setDraft('normal');shell.submit();await vi.waitFor(()=>{ expect(sink).toHaveBeenCalledWith('normal',[],'queue',expect.any(AbortSignal)) })
  shell.dispose();await ctx.fiber.dispose()
})
