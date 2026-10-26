// Acceptance harness: same production app, all upstream network calls deliberately unavailable.
// This is a repeatable network isolation test, not a claim that a physical cable was unplugged.
import {createApp} from '../server/index.mjs';
const app=createApp({env:{},fetchImpl:async()=>{throw new Error('Verification: upstream network disconnected');}});
const server=app.listen(8788,'127.0.0.1',()=>console.log('Offline verification only: http://127.0.0.1:8788/'));
process.on('SIGINT',()=>server.close());
