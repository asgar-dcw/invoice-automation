export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = `${context.env.N8N_BASE_URL}${url.pathname}${url.search}`;
  return fetch(new Request(target, context.request));
}
