const fs = require('fs')
const path = require('path')
const logger = require('./logger')
const nodeID3 = require('node-id3')
const Metaflac = require('metaflac-js2')

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

  writeMetadata (trackInfo, trackPath = '', coverPath = '', lyricStr = '') {
    let written = true;
    if (trackPath.endsWith('mp3')) {
      const tags = {
        title: trackInfo.title,
        album: trackInfo.album,
        artist: trackInfo.artist,
        year: trackInfo.year,
        date: trackInfo.year,
        TRCK: trackInfo.albumNo,
        MCDI: trackInfo.discNo
      }
      if (trackInfo.albumImg) tags.APIC = path.resolve(coverPath)
      if (lyricStr) tags.USLT = lyricStr

      logger.debug('MP3 头信息', tags)
      const result = nodeID3.write(tags, trackPath)
      if (result) {
        logger.debug('MP3 头信息写入完成！')
      } else {
        logger.warn('MP3 头信息写入失败！')
      }
    } else {
      try {
        const flac = new Metaflac(trackPath)

        flac.setTag('TITLE=' + trackInfo.title)
        flac.setTag('ALBUM=' + trackInfo.album)
        flac.setTag('ARTIST=' + trackInfo.artist)
        flac.setTag('DATE=' + trackInfo.year)
        flac.setTag('YEAR=' + trackInfo.year)
        flac.setTag('TRACKNUMBER=' + trackInfo.albumNo)
        flac.setTag('DISCNUMBER=' + trackInfo.discNo)

        if (trackInfo.albumImg) flac.importPicture(coverPath)
        if (lyricStr) flac.setTag('LYRICS=' + lyricStr)

        flac.save()
      } catch(e) {        
        // Create metadata text file
        const txtPath = trackPath.replace(/\.[^/.]+$/, "") + '.txt';
        const metadataContent = `
Title: ${trackInfo.title}
Album: ${trackInfo.album}
Artist: ${trackInfo.artist}
Year: ${trackInfo.year}
Track Number: ${trackInfo.albumNo}
Disc Number: ${trackInfo.discNo}
Lyrics: ${lyricStr}
`;
        
        fs.writeFileSync(txtPath, metadataContent.trim());
        logger.warn(`歌曲 ${trackInfo.title} 格式不支持！元信息已写入 ${txtPath}！`)
        
        // Handle cover image if exists
        if (trackInfo.albumImg) {
          const coverExt = path.extname(coverPath);
          const newCoverPath = path.join(path.dirname(trackPath), path.basename(trackPath, path.extname(trackPath)) + coverExt);
          
          try {
            fs.copyFileSync(coverPath, newCoverPath);
            logger.warn(`歌曲封面已写入 ${newCoverPath}`);
            written = false;
          } catch (copyError) {
            logger.warn(`无法写入封面： ${copyError.message}`);
          }
        }
      }
    }

    if (trackInfo.albumImg && written) {
      fs.unlink(coverPath, (error) => {
        if (error) throw error
      })
    }
  }
}
