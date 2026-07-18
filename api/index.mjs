export default async function handler(req, res) {
  const { reqHandler } = await import('../dist/app/server/server.mjs');
  return reqHandler(req, res);
}
