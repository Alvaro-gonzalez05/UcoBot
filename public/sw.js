// Service Worker for UcoBot Push Notifications
// This runs in the background even when the app is closed

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch (e) {
    data = {
      title: 'UcoBot',
      body: event.data.text(),
      icon: '/favicon.png',
    }
  }

  const title = data.title || 'UcoBot'
  const options = {
    body: data.body || 'Tienes una nueva notificación',
    icon: data.icon || '/favicon.png',
    badge: '/favicon.png',
    image: data.image || undefined,
    data: {
      url: data.url || '/dashboard',
    },
    vibrate: [200, 100, 200],
    tag: data.tag || 'ucobot-notification',
    renotify: true,
    requireInteraction: data.requireInteraction || false,
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// Handle notification click — open the app or focus the tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If there's already a tab open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Otherwise, open a new window
      return clients.openWindow(url)
    })
  )
})
