const path = require('path')
const fs = require('fs')
const { shell } = require('electron')
const cp = require('child_process')
let bookmarksDataCache = null
let tabListCache = []

function getEdgeBookmarks() {
  let edgeDataDir = ''
  const profiles = ['Default', 'Profile 3', 'Profile 2', 'Profile 1']
  if (process.platform === 'win32') {
    edgeDataDir = path.join(process.env['LOCALAPPDATA'], 'Microsoft/Edge/User Data')
  } else if (process.platform === 'darwin') {
    edgeDataDir = path.join(window.utools.getPath('appData'), 'Microsoft Edge')
  } else if (process.platform === 'linux') {
    edgeDataDir = path.join(window.utools.getPath('appData'), 'microsoft-edge')
  }
  const profile = profiles.find(profile => fs.existsSync(path.join(edgeDataDir, profile, 'Bookmarks')))
  if (!profile) return []
  const bookmarkPath = path.join(edgeDataDir, profile, 'Bookmarks')
  const bookmarksData = []
  try {
    const data = JSON.parse(fs.readFileSync(bookmarkPath, 'utf-8'))
    const getUrlData = (item) => {
      if (!item || !Array.isArray(item.children)) return
      item.children.forEach(c => {
        if (c.type === 'url') {
          var favicon = c.url + '/favicon.ico';
          bookmarksData.push({
            lowTitle: c.name.toLowerCase(),
            title: c.name,
            description: c.url,
            icon: favicon
          })
        } else if (c.type === 'folder') {
          getUrlData(c)
        }
      })
    }
    getUrlData(data.roots.bookmark_bar)
    getUrlData(data.roots.other)
    getUrlData(data.roots.synced)
  } catch (e) { }
  return bookmarksData
}

window.exports = {
  'inprivate_mode': {
    mode: 'none',
    args: {
      enter: (action) => {
        const url = window.utools.getCurrentBrowserUrl()
        if (!url) {
          window.utools.outPlugin()
          return
        }
        window.utools.hideMainWindow()
        let edgePath = action.payload.appPath
        if (process.platform === 'darwin') {
          edgePath = path.join(edgePath, 'Contents/MacOS/Microsoft Edge')
        }
        cp.execFile(edgePath, ['--inprivate', url], () => {
          window.utools.outPlugin()
        })
      }
    }
  },
  'edge_bookmarks': {
    mode: 'list',
    args: {
      enter: (action, callbackSetList) => {
        bookmarksDataCache = getEdgeBookmarks()
        callbackSetList(bookmarksDataCache)
      },
      search: (action, searchWord, callbackSetList) => {
        if (!searchWord) return callbackSetList()
        searchWord = searchWord.toLowerCase()
        callbackSetList(bookmarksDataCache.filter(x => x.lowTitle.includes(searchWord)))
      },
      select: (action, itemData) => {
        window.utools.hideMainWindow()
        shell.openExternal(itemData.description).then(() => {
          window.utools.outPlugin()
        })
      }
    }
  },
  'opened_tabs': {
    mode: 'list',
    args: {
      enter: (action, callbackSetList) => {
        tabListCache = []
        cp.exec(`osascript -e 'set tabString to ""
          tell application "Microsoft Edge"
              set window_list to every window
              repeat with the_window in window_list
                  set tab_list to every tab in the_window
                  repeat with the_tab in tab_list
                      set the_title to the title of the_tab
                      set the_url to the URL of the_tab
                      set tabString to tabString & the_title & "\n" & the_url & "\n\n"
                  end repeat
              end repeat
              return tabString
          end tell'`, (error, stdout, stderr) => {
          if (error) return window.utools.showNotification(stderr)
          if (!stdout.trim()) return
          const list = stdout.trim().split('\n\n')
          list.forEach(r => {
            const rl = r.split('\n')
            tabListCache.push({
              title: rl[0],
              description: rl[1]
            })
          })
          callbackSetList(tabListCache)
        })
      },
      search: (action, searchWord, callbackSetList) => {
        if (!searchWord) return callbackSetList(tabListCache)
        searchWord = searchWord.toLowerCase()
        const list = tabListCache.filter(x => x.title.toLowerCase().includes(searchWord) || x.description.toLowerCase().includes(searchWord))
        callbackSetList(list)
      },
      select: (action, itemData) => {
        window.utools.hideMainWindow()
        cp.exec(`osascript -e 'tell application "Microsoft Edge"
          repeat with w in (windows)
              set j to 0
              repeat with t in (tabs of w)
                  set j to j + 1
                  if URL of t is "${itemData.description}" then
                      set (active tab index of w) to j
                      set index of w to 1
                  end if
              end repeat
          end repeat
        end tell'`, (error, stdout, stderr) => {
          if (error) return window.utools.showNotification(stderr)
          window.utools.outPlugin()
        })
      }
    }
  }
}