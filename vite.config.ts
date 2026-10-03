import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * In dev, serve the Vercel function at /api/condense too, so condense.chat works on localhost.
 * The key comes from CONDENSE_API_KEY (shell env or an untracked .env file), never from the client.
 */
function condenseDevApi(): Plugin {
  return {
    name: 'condense-dev-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      if (env.CONDENSE_API_KEY && !process.env.CONDENSE_API_KEY) process.env.CONDENSE_API_KEY = env.CONDENSE_API_KEY
      server.middlewares.use('/api/condense', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const mod = (await server.ssrLoadModule('/api/condense.js')) as { POST: (r: Request) => Promise<Response> }
        const out = await mod.POST(new Request('http://localhost/api/condense', { method: 'POST', headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks) }))
        res.statusCode = out.status
        res.setHeader('content-type', out.headers.get('content-type') ?? 'application/json')
        res.end(await out.text())
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), condenseDevApi()],
})
