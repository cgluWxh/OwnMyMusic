const fs = require('fs')
const path = require('path')
const logger = require('./logger')
const nodeID3 = require('node-id3')
const Metaflac = require('metaflac-js2')
const mm = require('music-metadata')
const { exec } = require('child_process')
const { promisify } = require('util')
const execPromise = promisify(exec)

module.exports = {
  generateTrackMetadata (data, publishTime = 0) {
    const metadata = {
      id: data.id,
      artist: '',
      artists: [],
      album: '',
      albumImg: null,
      albumNo: null,
      discNo: null,
      title: '',
      year: null
    }
    for (const artist of data.ar) metadata.artists.push(artist.name)

    metadata.album = data.al.name
    metadata.albumImg = data.al.picUrl || null
    metadata.albumNo = data.no
    metadata.discNo = data.cd
    if (data.publishTime || publishTime) {
      metadata.year = (new Date(parseInt(data.publishTime || publishTime, 10))).getFullYear()
    }

    metadata.title = data.name

    metadata.artist = metadata.artists.join('/')

    return metadata
  },

  async writeMetadata (trackInfo, trackPath = '', coverPath = '', lyricStr = '') {
    try {
      // 通过读取文件头检测实际格式
      const format = await this._detectFileFormat(trackPath)
      
      logger.debug(`检测到文件格式: ${format}，文件路径: ${trackPath}`)
      
      let written = false
      
      // 根据实际格式写入元数据
      if (format === 'mp3') {
        written = await this._writeMP3Metadata(trackInfo, trackPath, coverPath, lyricStr)
      } else if (format === 'flac') {
        written = await this._writeFLACMetadata(trackInfo, trackPath, coverPath, lyricStr)
      } else if (format === 'm4a') {
        written = await this._writeM4AMetadata(trackInfo, trackPath, coverPath, lyricStr)
      } else if (format === 'ogg') {
        written = await this._writeOGGMetadata(trackInfo, trackPath, coverPath, lyricStr)
      } else {
        logger.warn(`不支持的文件格式: ${format}，文件: ${trackPath}`)
      }
      
      // 如果成功写入元数据，删除临时封面文件
      if (written && trackInfo.albumImg && fs.existsSync(coverPath)) {
        fs.unlink(coverPath, (error) => {
          if (error) logger.warn(`删除临时封面失败: ${error.message}`)
        })
      }
    } catch (error) {
      logger.warn(`无法处理文件元数据: ${trackPath}, 错误: ${error.message}`)
    }
  },

  async _detectFileFormat (filePath) {
    // 读取文件头来检测格式
    const buffer = Buffer.alloc(16)
    const fd = fs.openSync(filePath, 'r')
    fs.readSync(fd, buffer, 0, 16, 0)
    fs.closeSync(fd)

    // 检查魔数 (magic numbers)
    // MP3: FF FB 或 FF F3 或 FF F2 或 ID3
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
      return 'mp3'
    }
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) { // ID3
      return 'mp3'
    }

    // FLAC: fLaC (66 4C 61 43)
    if (buffer[0] === 0x66 && buffer[1] === 0x4C && buffer[2] === 0x61 && buffer[3] === 0x43) {
      return 'flac'
    }

    // M4A/MP4: ftyp
    if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
      return 'm4a'
    }

    // OGG: OggS
    if (buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
      return 'ogg'
    }

    // 如果无法通过魔数识别，尝试使用 music-metadata
    try {
      const metadata = await mm.parseFile(filePath)
      const format = metadata.format.container || metadata.format.codec || ''
      
      if (format.toLowerCase().includes('mp3') || format === 'MPEG') {
        return 'mp3'
      } else if (format.toLowerCase().includes('flac')) {
        return 'flac'
      } else if (format.toLowerCase().includes('m4a') || format.toLowerCase().includes('mp4')) {
        return 'm4a'
      } else if (format.toLowerCase().includes('ogg') || format.toLowerCase().includes('vorbis') || format.toLowerCase().includes('opus')) {
        return 'ogg'
      }
    } catch (e) {
      logger.debug(`music-metadata 解析失败: ${e.message}`)
    }

    return 'unknown'
  },

  _writeMP3Metadata (trackInfo, trackPath, coverPath, lyricStr) {
    try {
      const tags = {
        title: trackInfo.title,
        album: trackInfo.album,
        artist: trackInfo.artist,
        year: trackInfo.year,
        date: trackInfo.year,
        TRCK: trackInfo.albumNo,
        MCDI: trackInfo.discNo
      }
      if (trackInfo.albumImg && fs.existsSync(coverPath)) {
        tags.APIC = path.resolve(coverPath)
      }
      if (lyricStr) {
        tags.USLT = {
          language: 'chi',
          text: lyricStr
        }
      }

      logger.debug('MP3 头信息', tags)
      const result = nodeID3.write(tags, trackPath)
      if (result) {
        logger.debug('MP3 头信息写入完成！')
        return true
      } else {
        logger.warn('MP3 头信息写入失败！')
        return false
      }
    } catch (error) {
      logger.warn(`MP3 元数据写入失败: ${error.message}`)
      return false
    }
  },

  _writeFLACMetadata (trackInfo, trackPath, coverPath, lyricStr) {
    try {
      const flac = new Metaflac(trackPath)
      flac.setTag('TITLE=' + trackInfo.title)
      flac.setTag('ALBUM=' + trackInfo.album)
      flac.setTag('ARTIST=' + trackInfo.artist)
      flac.setTag('DATE=' + trackInfo.year)
      flac.setTag('YEAR=' + trackInfo.year)
      flac.setTag('TRACKNUMBER=' + trackInfo.albumNo)
      flac.setTag('DISCNUMBER=' + trackInfo.discNo)

      if (trackInfo.albumImg && fs.existsSync(coverPath)) {
        try {
          flac.importPicture(coverPath)
        } catch (pictureError) {
          logger.warn(`FLAC 封面导入失败: ${pictureError.message}`)
        }
      }
      if (lyricStr) flac.setTag('LYRICS=' + lyricStr)
      flac.save()
      logger.debug('FLAC 头信息写入完成！')
      return true
    } catch (error) {
      logger.warn(`FLAC 元数据写入失败: ${error.message}`)
      return false
    }
  },

  async _writeM4AMetadata (trackInfo, trackPath, coverPath, lyricStr) {
    const tmpPath = trackPath + '.tmp.m4a'
    
    try {
      // M4A 使用 ©lyr atom 存储歌词
      let cmd = `ffmpeg -i "${trackPath}" -y `
      cmd += `-metadata title="${this._escapeQuotes(trackInfo.title)}" `
      cmd += `-metadata album="${this._escapeQuotes(trackInfo.album)}" `
      cmd += `-metadata artist="${this._escapeQuotes(trackInfo.artist)}" `
      cmd += `-metadata date="${trackInfo.year}" `
      cmd += `-metadata track="${trackInfo.albumNo}" `
      cmd += `-metadata disc="${trackInfo.discNo}" `
      
      if (lyricStr) {
        const escapedLyrics = this._escapeQuotes(lyricStr)
        cmd += `-metadata lyrics="${escapedLyrics}" `
      }
      
      cmd += `-codec copy "${tmpPath}"`
      
      await execPromise(cmd, { maxBuffer: 10 * 1024 * 1024 })
      
      // 替换原文件
      fs.renameSync(tmpPath, trackPath)
      
      // 处理封面
      if (trackInfo.albumImg && fs.existsSync(coverPath)) {
        const tmpCoverPath = trackPath + '.cover.m4a'
        const coverCmd = `ffmpeg -i "${trackPath}" -i "${coverPath}" -y -map 0 -map 1 -c copy -disposition:v:0 attached_pic "${tmpCoverPath}"`
        try {
          await execPromise(coverCmd)
          fs.renameSync(tmpCoverPath, trackPath)
        } catch (coverError) {
          logger.warn(`M4A 封面写入失败: ${coverError.message}`)
        }
      }
      
      logger.debug('M4A 头信息写入完成！')
      return true
    } catch (error) {
      logger.warn(`M4A 元数据写入失败: ${error.message}`)
      // 清理临时文件
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      return false
    }
  },

  async _writeOGGMetadata (trackInfo, trackPath, coverPath, lyricStr) {
    const tmpPath = trackPath + '.tmp.ogg'
    
    try {
      // OGG 使用 Vorbis Comment 存储元数据
      let cmd = `ffmpeg -i "${trackPath}" -y `
      cmd += `-metadata title="${this._escapeQuotes(trackInfo.title)}" `
      cmd += `-metadata album="${this._escapeQuotes(trackInfo.album)}" `
      cmd += `-metadata artist="${this._escapeQuotes(trackInfo.artist)}" `
      cmd += `-metadata date="${trackInfo.year}" `
      cmd += `-metadata tracknumber="${trackInfo.albumNo}" `
      cmd += `-metadata discnumber="${trackInfo.discNo}" `
      
      if (lyricStr) {
        const escapedLyrics = this._escapeQuotes(lyricStr)
        cmd += `-metadata lyrics="${escapedLyrics}" `
      }
      
      cmd += `-codec copy "${tmpPath}"`
      
      await execPromise(cmd, { maxBuffer: 10 * 1024 * 1024 })
      
      // 替换原文件
      fs.renameSync(tmpPath, trackPath)
      
      logger.debug('OGG 头信息写入完成！')
      return true
    } catch (error) {
      logger.warn(`OGG 元数据写入失败: ${error.message}`)
      // 清理临时文件
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      return false
    }
  },

  _escapeFFmpegMetadata (str) {
    if (!str) return ''
    // FFmpeg 元数据文件格式：需要转义 =, ;, #, \, 换行符
    return String(str)
      .replace(/\\/g, '\\\\')  // 反斜杠
      .replace(/=/g, '\\=')     // 等号
      .replace(/;/g, '\\;')     // 分号
      .replace(/#/g, '\\#')     // 井号
      .replace(/\n/g, '\\n')    // 换行符转义为字面 \n
      .replace(/\r/g, '')       // 删除回车符
  },

  _escapeQuotes (str) {
    if (!str) return ''
    // 转义命令行中的引号和特殊字符
    return String(str)
      .replace(/\\/g, '\\\\')  // 反斜杠
      .replace(/"/g, '\\"')    // 双引号
      .replace(/\$/g, '\\$')    // 美元符号
      .replace(/`/g, '\\`')     // 反引号
  }
}
