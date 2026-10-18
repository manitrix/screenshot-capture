// Self-contained so the context-menu capture does not need vendor libraries.
(() => {
  const key = '__screenshotCaptureClipboard'
  if (globalThis[key]) return
  globalThis[key] = true

  const host = document.createElement('div')
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;cursor:crosshair;touch-action:none;'
  const shadow = host.attachShadow({mode: 'closed'})
  shadow.innerHTML = `<style>
    :host { color-scheme: light; }
    .area { position:absolute; inset:0; overflow:hidden; background:rgba(0,0,0,.18); }
    .selection { position:absolute; display:none; border:1px solid white;
      box-sizing:border-box; box-shadow:0 0 0 99999px rgba(0,0,0,.25); }
    .hint { position:absolute; top:16px; left:50%; transform:translateX(-50%);
      padding:10px 16px; background:#202124; color:white; border-radius:8px;
      font:14px/1.4 system-ui,sans-serif; pointer-events:none; }
  </style><div class="area"><div class="selection"></div>
    <div class="hint">Drag to crop and copy · Esc to cancel</div></div>`
  const box = shadow.querySelector('.selection')
  let start, area, busy = false
  const cleanup = () => {
    host.remove()
    document.removeEventListener('keydown', onKey, true)
    window.removeEventListener('pagehide', cleanup)
    delete globalThis[key]
  }
  const onKey = event => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault()
      event.stopImmediatePropagation()
      cleanup()
    }
  }
  const point = event => ({
    x: Math.max(0, Math.min(innerWidth, event.clientX)),
    y: Math.max(0, Math.min(innerHeight, event.clientY))
  })
  const update = event => {
    const end = point(event)
    area = {x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y)}
    Object.assign(box.style, {display: 'block', left: `${area.x}px`,
      top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px`})
  }
  host.addEventListener('pointerdown', event => {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.button !== 0 || busy) return
    start = point(event)
    host.setPointerCapture(event.pointerId)
    update(event)
  })
  host.addEventListener('pointermove', event => {
    if (start && !busy) update(event)
  })
  host.addEventListener('pointercancel', () => { if (!busy) cleanup() })
  host.addEventListener('contextmenu', event => event.preventDefault())
  host.addEventListener('pointerup', async event => {
    if (!start || busy || event.button !== 0) return
    update(event)
    start = null
    if (area.w < 2 || area.h < 2) return
    busy = true
    const viewport = {width: innerWidth, height: innerHeight}
    host.style.display = 'none'
    try {
      // Wait for a paint without the crop overlay before capturing.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const response = await chrome.runtime.sendMessage({message: 'clipboard-capture'})
      if (!response || response.error) throw new Error(response?.error || 'Capture failed.')
      const image = new Image()
      image.src = response.image
      await image.decode()
      const sx = image.naturalWidth / viewport.width
      const sy = image.naturalHeight / viewport.height
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(area.w * sx))
      canvas.height = Math.max(1, Math.round(area.h * sy))
      canvas.getContext('2d').drawImage(image, area.x * sx, area.y * sy,
        area.w * sx, area.h * sy, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not create the cropped image.')
      if (!navigator.clipboard?.write) throw new Error('Clipboard access requires an HTTPS page or localhost.')
      await navigator.clipboard.write([new ClipboardItem({'image/png': blob})])
      cleanup()
      const notice = document.createElement('div')
      notice.textContent = 'Screenshot copied to clipboard'
      notice.style.cssText = 'all:initial;position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 18px;border-radius:8px;background:#202124;color:white;font:14px system-ui,sans-serif;pointer-events:none;'
      document.documentElement.appendChild(notice)
      setTimeout(() => notice.remove(), 2200)
    }
    catch (error) {
      cleanup()
      alert(`Screenshot Capture: ${error.message}`)
    }
  })
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('pagehide', cleanup)
  document.documentElement.appendChild(host)
})()
