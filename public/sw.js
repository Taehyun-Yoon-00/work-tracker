// public/sw.js
// 알림(Notification) Push 수신 + 앱 아이콘 뱃지 업데이트를 담당하는 Service Worker
// 뱃지 값은 "읽지 않은 Notification 개수" 기준입니다.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch (e) {
    data = { title: '근무관리 시스템', body: event.data.text() }
  }

  const title = data.title || '근무관리 시스템'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    data: { url: data.url || '/approval' },
  }

  const tasks = [self.registration.showNotification(title, options)]

  // unreadCount(읽지 않은 Notification 개수)가 함께 전달되면 앱 아이콘 뱃지도 갱신
  // (Service Worker 안에는 navigator가 없으므로 self.registration.setAppBadge 사용)
  if (typeof data.unreadCount === 'number') {
    if (data.unreadCount > 0) {
      tasks.push(self.registration.setAppBadge(data.unreadCount))
    } else {
      tasks.push(self.registration.clearAppBadge())
    }
  }

  event.waitUntil(Promise.all(tasks))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/approval'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})
