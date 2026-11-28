import {it,expect,vi} from 'vitest';
it('accepts only https origins without a path for EXTRA_ORIGINS',async()=>{
 vi.resetModules();process.env.EXTRA_ORIGINS='https://hyperhive.tech, https://www.hyperhive.tech';
 const {config}=await import('../packages/core/config.js');
 expect(config.EXTRA_ORIGINS).toEqual(['https://hyperhive.tech','https://www.hyperhive.tech']);
 vi.resetModules();process.env.EXTRA_ORIGINS='http://hyperhive.tech';
 await expect(import('../packages/core/config.js')).rejects.toThrow();
 vi.resetModules();process.env.EXTRA_ORIGINS='https://hyperhive.tech/path';
 await expect(import('../packages/core/config.js')).rejects.toThrow();
 delete process.env.EXTRA_ORIGINS;vi.resetModules();
});
