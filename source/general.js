const fs = require('fs')
const path = require('path')
const config = require('./config')
const pRetry = require('p-retry')
const logger = require('./logger')
const Downloader = require('nodejs-file-downloader')

module.exports = {
  replaceChar (str) {
    // eslint-disable-next-line no-useless-escape
    return `${str}`.replace(/[\\\/:\*\?"<>\|\t]/gm, ' ')
  },

  // https://stackoverflow.com/questions/3954438/how-to-remove-item-from-array-by-value
  removeValueFromArray (arr) {
    var what; var a = arguments; var L = a.length; var ax
    while (L > 1 && arr.length) {
      what = a[--L]
      while ((ax = arr.indexOf(what)) !== -1) {
        arr.splice(ax, 1)
      }
    }

    return arr
  },

  downloadFile (trackInfo, fileURL, savePath) {
    fileURL = fileURL.replace('https', 'http')
    logger.debug('文件下载地址：', fileURL)
    let isPhoto = false
    let msg = 'Music file'
    if (fileURL.endsWith('640')) {
      isPhoto = true
      msg = 'Cover'
    }

    const filename = trackInfo.id + ((isPhoto) ? '.jpg' : ((fileURL.endsWith('mp3')) ? '.mp3' : '.flac'))

    return pRetry(() => {
      const dl = new Downloader({
        url: fileURL,
        directory: path.resolve(savePath),
        fileName: filename,
        cloneFiles: false,
        timeout: (isPhoto) ? 10000 : 60000
      })

      return dl.download().then(() => {
        logger.debug(`[歌曲: ${trackInfo.title}][${msg}] 下载完成！`)
      }).catch((error) => {
        logger.warn(`[歌曲: ${trackInfo.title}][${msg}]`, error)
        throw error
      })
    }, {
      retries: 3,
      onFailedAttempt: (error) => {
        logger.error(error)
        logger.warn(`[歌曲: ${trackInfo.title}][${msg}] 第 ${error.attemptNumber} 次尝试失败，还将重试 ${error.retriesLeft} 次！`)
      }
    })
  },

  genUserPlaylistFile (__root) {
    const dirname = path.resolve(__root, '../../')
    const dirlist = fs.readdirSync(dirname)
    for (const dirn of dirlist) {
      const userDirname = path.resolve(dirname, dirn)

      if (dirn === 'azusa') continue
      if (!fs.existsSync(userDirname) || !fs.lstatSync(userDirname).isDirectory()) continue

      const audioList = []
      const filelist = fs.readdirSync(userDirname)

      for (const audioFile of filelist) {
        if (!audioFile.startsWith('._') &&
      (audioFile.endsWith('mp3') ||
        audioFile.endsWith('wma') ||
        audioFile.endsWith('flac') ||
        audioFile.endsWith('wav') ||
        audioFile.endsWith('mp4') ||
        audioFile.endsWith('m4a') ||
        audioFile.endsWith('aif') ||
        audioFile.endsWith('dsf') ||
        audioFile.endsWith('dff') ||
        audioFile.endsWith('ape'))) audioList.push(dirn + '/' + audioFile)
      }
      fs.writeFileSync(path.resolve(dirname, config('prefix', []).userDir + dirn + '  .m3u'), '#EXTM3U\n\n' + audioList.join('\n'))
    }
  }
}
