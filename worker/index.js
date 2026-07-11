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

  event.waitUntil(
    (async () => {
      // iOS(WebKit)는 앱이 완전히 종료된 상태에서 setAppBadge와 showNotification을
      // 동시에(Promise.all) 호출하면 배지 반영이 누락되는 경우가 보고되어 있음.
      // showNotification이 끝난 뒤 순차적으로 setAppBadge를 호출하도록 변경.
      await self.registration.showNotification(title, options)

      if (typeof data.unreadCount === 'number') {
        if (data.unreadCount > 0) {
          await self.registration.setAppBadge(data.unreadCount)
        } else {
          await self.registration.clearAppBadge()
        }
      }
    })()
  )
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
