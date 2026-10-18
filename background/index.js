
// chrome.storage.sync.clear()

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'crop-to-clipboard',
      title: 'Crop screenshot to clipboard',
      contexts: ['page', 'selection', 'link', 'image', 'video', 'audio', 'editable'],
      documentUrlPatterns: ['http://*/*', 'https://*/*', 'file:///*']
    })
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'crop-to-clipboard' || !tab) return
  try {
    await chrome.scripting.executeScript({
      files: ['content/clipboard.js'], target: {tabId: tab.id}
    })
  }
  catch (error) {
    console.error('Screenshot Capture:', error)
    chrome.action.setBadgeText({tabId: tab.id, text: '!'})
    chrome.action.setTitle({tabId: tab.id, title: 'Cannot capture this page. Open a regular webpage and try again.'})
  }
})

var defaults = {
  method: 'crop',
  format: 'png',
  quality: 100,
  scaling: true,
  save: ['file'],
  clipboard: 'url',
  dialog: true,
  icon: 'default',
}

chrome.storage.sync.get((store) => {
  var config = {}
  Object.assign(config, defaults, JSON.parse(JSON.stringify(store)))
  // v3.0 -> v3.1
  if (typeof config.save === 'string') {
    config.clipboard = /url|binary/.test(config.save) ? config.save : 'url'
    config.save = /url|binary/.test(config.save) ? ['clipboard'] : ['file']
  }
  if (config.dpr !== undefined) {
    config.scaling = config.dpr
    delete config.dpr
  }
  if (typeof config.icon === 'boolean') {
    config.icon = config.icon === false ? 'default' : 'light'
  }
  chrome.storage.sync.set(config)

  chrome.action.setIcon({
    path: [16, 19, 38, 48, 128].reduce((all, size) => (
      all[size] = `/icons/${config.icon}/${size}x${size}.png`,
      all
    ), {})
  })
})

async function inject (tab) {
  if (!tab?.id) return
  if (!/^(https?|file):/.test(tab.url || '') ||
      /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)(\/|$)/.test(tab.url || '')) {
    await chrome.action.setBadgeText({tabId: tab.id, text: '!'})
    await chrome.action.setTitle({tabId: tab.id, title: 'Cannot capture this page. Open a regular webpage and try again.'})
    return
  }
  try {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {message: 'init'})
      if (response) return
    }
    catch (_) { /* No content script yet on this page. */ }
    const target = {tabId: tab.id}
    await chrome.scripting.insertCSS({files: ['vendor/jquery.Jcrop.min.css', 'content/index.css'], target})
    await chrome.scripting.executeScript({
      files: ['vendor/jquery.min.js', 'vendor/jquery.Jcrop.min.js', 'content/crop.js', 'content/index.js'], target
    })
    await chrome.tabs.sendMessage(tab.id, {message: 'init'})
  }
  catch (error) {
    await chrome.action.setBadgeText({tabId: tab.id, text: '!'})
    await chrome.action.setTitle({tabId: tab.id, title: `Screenshot Capture: ${error.message}`})
  }
}

chrome.action.onClicked.addListener((tab) => {
  inject(tab)
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'take-screenshot') {
    chrome.tabs.query({active: true, currentWindow: true}, (tab) => {
      inject(tab[0])
    })
  }
})

chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (req.message === 'clipboard-capture') {
    if (!sender.tab) return
    chrome.tabs.query({active: true, windowId: sender.tab.windowId}, (tabs) => {
      if (!tabs[0] || tabs[0].id !== sender.tab.id) {
        res({error: 'Keep the selected tab active while capturing.'})
        return
      }
      chrome.tabs.captureVisibleTab(sender.tab.windowId, {format: 'png'}, (image) => {
        var error = chrome.runtime.lastError
        res(error ? {error: error.message} : {image})
      })
    })
  }
  else if (req.message === 'capture') {
    chrome.tabs.query({active: true, currentWindow: true}, (tab) => {
      chrome.tabs.captureVisibleTab(sender.tab?.windowId, {format: req.format, quality: req.quality}, (image) => {
        const error = chrome.runtime.lastError
        if (error) { res({error: error.message}); return }
        // image is base64
        res({message: 'image', image})
      })
    })
  }
  else if (req.message === 'active') {
    if (req.active) {
      chrome.storage.sync.get((config) => {
        if (config.method === 'crop') {
          chrome.action.setTitle({tabId: sender.tab.id, title: 'Crop and Save'})
          chrome.action.setBadgeText({tabId: sender.tab.id, text: '◩'})
        }
        else if (config.method === 'wait') {
          chrome.action.setTitle({tabId: sender.tab.id, title: 'Crop and Wait'})
          chrome.action.setBadgeText({tabId: sender.tab.id, text: '◪'})
        }
        else if (config.method === 'view') {
          chrome.action.setTitle({tabId: sender.tab.id, title: 'Capture Viewport'})
          chrome.action.setBadgeText({tabId: sender.tab.id, text: '⬒'})
        }
        else if (config.method === 'page') {
          chrome.action.setTitle({tabId: sender.tab.id, title: 'Capture Document'})
          chrome.action.setBadgeText({tabId: sender.tab.id, text: '◼'})
        }
      })
    }
    else {
      chrome.action.setTitle({tabId: sender.tab.id, title: 'Screenshot Capture'})
      chrome.action.setBadgeText({tabId: sender.tab.id, text: ''})
    }
  }
  return true
})
