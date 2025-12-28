#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const api = require('./source/api')
const metadata = require('./source/metadata')
const lyric = require('./source/lyric')
const general = require('./source/general')
const logger = require('./source/logger')
const { program } = require('commander')

// 修复单个歌曲的元数据
async function fixSongMetadata(filePath) {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      logger.warn(`文件不存在: ${filePath}`)
      return false
    }

    // 从文件名提取歌曲 ID
    const fileName = path.basename(filePath, path.extname(filePath))
    const trackId = parseInt(fileName, 10)
    
    if (isNaN(trackId)) {
      logger.warn(`无法从文件名提取歌曲 ID: ${filePath}`)
      return false
    }

    logger.info(`正在修复歌曲: ${filePath} (ID: ${trackId})`)

    // 获取歌曲信息
    logger.debug('获取歌曲详细信息...')
    const trackData = await api.getTrackInfo(trackId)
    
    if (!trackData) {
      logger.warn(`无法获取歌曲信息，ID: ${trackId}`)
      return false
    }
    
    const trackInfo = metadata.generateTrackMetadata(trackData)
    
    logger.info(`歌曲名: ${trackInfo.title}`)
    logger.info(`艺术家: ${trackInfo.artist}`)
    logger.info(`专辑: ${trackInfo.album}`)

    // 创建临时目录
    const tmpDir = path.join(path.dirname(filePath), `.tmp_${trackId}`)
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }

    // 下载封面
    let coverPath = ''
    if (trackInfo.albumImg) {
      try {
        logger.debug('下载专辑封面...')
        coverPath = path.join(tmpDir, trackId + '.jpg')
        await general.downloadFile(trackInfo, trackInfo.albumImg + '?param=640y640', tmpDir)
        logger.info('封面下载完成')
      } catch (error) {
        logger.warn(`封面下载失败: ${error.message}`)
        trackInfo.albumImg = ''
      }
    }

    // 获取歌词
    logger.debug('获取歌词...')
    const lyricData = await api.getLyric(trackId)
    let lyricStr = ''
    
    if (!lyricData.lrc || !lyricData.lrc.lyric) {
      logger.debug('找不到歌词')
    } else {
      lyricStr = lyric.generateLyric(trackId, lyricData)
      logger.info('歌词获取完成')
    }

    // 写入元数据
    logger.info('写入元数据...')
    await metadata.writeMetadata(trackInfo, filePath, coverPath, lyricStr)
    
    // 清理临时目录
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }

    logger.info(`✓ 歌曲修复完成: ${trackInfo.title}`)
    return true
  } catch (error) {
    logger.warn(`修复失败: ${error.message}`)
    logger.debug(error.stack)
    return false
  }
}

// 批量修复歌曲
async function fixMultipleSongs(filePaths) {
  let success = 0
  let failed = 0

  for (const filePath of filePaths) {
    const result = await fixSongMetadata(filePath)
    if (result) {
      success++
    } else {
      failed++
    }
  }

  logger.info(`\n修复完成: 成功 ${success} 个, 失败 ${failed} 个`)
}

// 主程序
;(async () => {
  program
    .name('cli')
    .description('OwnMyMusic CLI 工具 - 修复歌曲元数据')
    .version('1.0.0')

  program
    .command('fix')
    .description('修复歌曲元数据')
    .argument('<paths...>', '歌曲文件路径（可以指定多个）')
    .action(async (paths) => {
      try {
        // 登录网易云音乐
        logger.info('尝试登录网易云音乐...')
        await api.login(path.resolve('account.json'))

        // 修复歌曲
        await fixMultipleSongs(paths)
      } catch (error) {
        logger.error('错误:', error.message)
        logger.debug(error.stack)
        process.exit(1)
      }
    })

  program.parse()
})().catch((error) => {
  console.error('错误:', error.message)
  process.exit(1)
})
