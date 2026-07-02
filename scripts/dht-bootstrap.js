// Local DHT bootstrap node for offline development and demos.
// The public Hyperswarm DHT needs UDP that corporate networks often block;
// pointing peers at this node keeps everything on 127.0.0.1.
import DHT from "hyperdht";

const PORT = Number(process.env.DHT_PORT ?? 49737);

const node = DHT.bootstrapper(PORT, "127.0.0.1");
await node.ready();
console.log(`[terrace] local DHT bootstrap listening on 127.0.0.1:${node.address().port}`);
console.log("[terrace] start app instances with SWARM_BOOTSTRAP=1 to use it");
