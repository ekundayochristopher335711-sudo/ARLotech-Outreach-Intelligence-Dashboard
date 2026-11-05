self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data?.text() || 'You have a new Arlotech update.' }
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Arlotech update'
  const options = {
    body: typeof payload.body === 'string' ? payload.body : 'Open your dashboard to review this update.',
    data: { url: typeof payload.url === 'string' ? payload.url : '/replies' },
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const requestedUrl = event.notification.data?.url
  let targetUrl = self.location.origin + '/replies'
  try {
    const parsedUrl = new URL(requestedUrl || '/replies', self.location.origin)
    if (parsedUrl.origin === self.location.origin) targetUrl = parsedUrl.href
  } catch {
    targetUrl = self.location.origin + '/replies'
  }

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.navigate(targetUrl)
        return client.focus()
      }
    }
    return self.clients.openWindow(targetUrl)
  })())
})
