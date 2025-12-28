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
      // 检测实际文件格式
      const metadata = await mm.parseFile(trackPath)
      const format = metadata.format.container || metadata.format.codec || ''
      
      logger.debug(`检测到文件格式: ${format}，文件路径: ${trackPath}`)
      
      let written = false
      
      // 根据实际格式写入元数据
      if (format.toLowerCase().includes('mp3') || format === 'MPEG') {
        written = await this._writeMP3Metadata(trackInfo, trackPath, coverPath, lyricStr)
      } else if (format.toLowerCase().includes('flac') || format === 'FLAC') {
        written = await this._writeFLACMetadata(trackInfo, trackPath, coverPath, lyricStr)
      } else if (format.toLowerCase().includes('m4a') || format === 'M4A' || format === 'mp4' || format.toLowerCase().includes('aac')) {
        written = await this._writeM4AMetadata(trackInfo, trackPath, coverPath, lyricStr)
      } else if (format.toLowerCase().includes('ogg') || format === 'Ogg' || format.toLowerCase().includes('vorbis') || format.toLowerCase().includes('opus')) {
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
      if (lyricStr) tags.USLT = lyricStr

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
        flac.importPicture(coverPath)
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
    const metadataFile = trackPath + '.metadata.txt'
    const tmpPath = trackPath + '.tmp.m4a'
    
    try {
      // 创建 ffmpeg 元数据文件，避免 shell 转义问题
      let metadataContent = ';FFMETADATA1\n'
      metadataContent += `title=${this._escapeFFmpegMetadata(trackInfo.title)}\n`
      metadataContent += `album=${this._escapeFFmpegMetadata(trackInfo.album)}\n`
      metadataContent += `artist=${this._escapeFFmpegMetadata(trackInfo.artist)}\n`
      metadataContent += `date=${trackInfo.year}\n`
      metadataContent += `track=${trackInfo.albumNo}\n`
      metadataContent += `disc=${trackInfo.discNo}\n`
      
      if (lyricStr) {
        metadataContent += `lyrics=${this._escapeFFmpegMetadata(lyricStr)}\n`
      }
      
      fs.writeFileSync(metadataFile, metadataContent, 'utf8')
      
      // 使用元数据文件而不是命令行参数
      const cmd = `ffmpeg -i "${trackPath}" -i "${metadataFile}" -y -map_metadata 1 -codec copy "${tmpPath}"`
      
      await execPromise(cmd)
      
      // 替换原文件
      fs.renameSync(tmpPath, trackPath)
      
      // 删除元数据文件
      fs.unlinkSync(metadataFile)
      
      // 处理封面（需要单独处理）
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
      if (fs.existsSync(metadataFile)) fs.unlinkSync(metadataFile)
      return false
    }
  },

  async _writeOGGMetadata (trackInfo, trackPath, coverPath, lyricStr) {
    const metadataFile = trackPath + '.metadata.txt'
    const tmpPath = trackPath + '.tmp.ogg'
    
    try {
      // 创建 ffmpeg 元数据文件
      let metadataContent = ';FFMETADATA1\n'
      metadataContent += `title=${this._escapeFFmpegMetadata(trackInfo.title)}\n`
      metadataContent += `album=${this._escapeFFmpegMetadata(trackInfo.album)}\n`
      metadataContent += `artist=${this._escapeFFmpegMetadata(trackInfo.artist)}\n`
      metadataContent += `date=${trackInfo.year}\n`
      metadataContent += `tracknumber=${trackInfo.albumNo}\n`
      metadataContent += `discnumber=${trackInfo.discNo}\n`
      
      if (lyricStr) {
        metadataContent += `lyrics=${this._escapeFFmpegMetadata(lyricStr)}\n`
      }
      
      fs.writeFileSync(metadataFile, metadataContent, 'utf8')
      
      // 使用元数据文件
      const cmd = `ffmpeg -i "${trackPath}" -i "${metadataFile}" -y -map_metadata 1 -codec copy "${tmpPath}"`
      
      await execPromise(cmd)
      
      // 替换原文件
      fs.renameSync(tmpPath, trackPath)
      
      // 删除元数据文件
      fs.unlinkSync(metadataFile)
      
      logger.debug('OGG 头信息写入完成！')
      return true
    } catch (error) {
      logger.warn(`OGG 元数据写入失败: ${error.message}`)
      // 清理临时文件
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      if (fs.existsSync(metadataFile)) fs.unlinkSync(metadataFile)
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
  }
}
