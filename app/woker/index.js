// worker/index.js
// next-pwa(GenerateSW)가 자동 생성하는 서비스워커에 합쳐지는 "커스텀" 부분입니다.
// 여기 있는 코드는 next.config.ts의 customWorkerSrc 설정을 통해
// 빌드 시 public/sw.js 안으로 함께 번들링됩니다.
//
// 주의: next build를 할 때마다 next-pwa가 public/sw.js 전체를 다시 생성하므로,
// public/sw.js 파일을 직접 수정하면 다음 빌드에서 그 수정 내용이 사라집니다.
// push/notificationclick 관련 로직은 반드시 이 파일에서 관리하세요.

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
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-192x192.png',
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
