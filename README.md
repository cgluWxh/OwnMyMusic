<p align="center">
  <img src="https://user-images.githubusercontent.com/20554060/107264211-aa90ba80-6a7d-11eb-8fef-6c3cf5b84bdf.png">
</p>

<p align="center">🎇 让可爱填满你的播放器(误</p>

<p align="center">
<a href="https://lyn.moe"><img alt="Author" src="https://img.shields.io/badge/Author-Lyn-blue.svg?style=for-the-badge"/></a>
<a href="https://github.com/kawaiilab/azusa"><img alt="Version" src="https://img.shields.io/github/package-json/v/kawaiilab/azusa?style=for-the-badge"/></a>
<img alt="License" src="https://img.shields.io/github/license/kawaiilab/azusa.svg?style=for-the-badge"/>
</p>

***

### Introduction

一个小工具，修改自 [Azusa](https://github.com/KawaiiLab/azusa)，将网易云音乐的数据同步至 [Navidrome](https://github.com/navidrome/navidrome) 等自建音乐服务。

### Feature

- 同步收藏的歌单/歌手/专辑
- 自动填充文件元数据
- 生成歌词及翻译
- 多线程下载
- 本地化 NeteaseCloudMusicApi / 打包后无外部依赖
- 支持日推 / 历史日推下载

### Usage

#### Dev version

1. 直接在播放器 `/MUSIC` 的同级目录克隆本项目，进入后输入 `npm install` 安装依赖
2. 将 `config.example.js` 重命名为 `config.js` 并按照 [Configuration](#Configuration) 小节的指示修改并保存
3. 输入 `npm start` 运行程序
4. Enjoy~

### Configuration

```javascript
module.exports = {
  // 日志等级
  logLevel: 'info',

  // 附加的歌单
  extraPlaylist: [
    12345,
    23345
  ],
  // 排除的歌单
  excludePlaylist: [],
  // 需要同步的歌单
  syncPlaylist: [
    233333,
    'all' // 当数组中存在字符串 all 时，程序会将所有可编辑的歌单添加到监控列表中
  ],

  // 是否下载收藏的专辑
  downloadSubAlbum: false,
  // 附加的专辑
  extraAlbum: [],
  // 排除的专辑
  excludeAlbum: [],

  // 是否下载收藏的歌手热门歌曲
  downloadSubArtist: false,
  // 下载的歌曲数量 (前 N 首)
  downloadSubArtistTopNum: 30,
  // 附加的歌手
  extraArtist: [],
  // 排除的歌手
  excludeArtist: [],

  // 下载当日日推
  downloadRecommendation: false,
  // 下载历史日推 (仅限黑胶 VIP )
  downloadHistoryRecommendation: false,

  // 下载音质
  bitRate: 999000,

  // 是否将歌词与翻译合并为一行
  mergeTranslation: false,

  // 播放列表前缀
  prefix: {
    album: '[Album] ',
    artistTopN: '[Artist Top $] ',
    playlist: '[Playlist] ',
    userDir: '[Dir] ',
    recommendation: '[Recommendation] '
  }
}
```

### Function Description

#### Flow

为本地目录创建播放列表文件 -> 登录&获取歌单列表&处理播放器端播放列表变动 -> 下载音乐及歌词至播放器&异步写入播放列表文件

#### Save Cookie

开启后运行时会在根目录下生成 `account.json` 用于存放账号 Cookie

#### Merge Translation

据反馈([#1](https://github.com/kawaiilab/azusa/issues/1))某些机器不支持多行同时间歌词，开启次开关后程序会将原文及翻译整合为一行

### Credit

[Original Project](https://github.com/KawaiiLab/azusa)

[Illustration: あずにゃん](https://www.pixiv.net/artworks/80257983)

### Name

[Azusa Nakano](https://myanimelist.net/character/21173/Azusa_Nakano) from [K-On!](https://myanimelist.net/anime/5680/K-On)

### LICENSE

MIT

