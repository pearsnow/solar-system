# 素材与许可

本仓库包含两类内容，许可不同，请分别引用。

## 代码

`src/`、`tools/` 下的源代码、`index.html`、`vite.config.js` 等 —— **MIT**，见 `LICENSE`。

## 贴图

`public/textures/` 下的全部行星、卫星、环、星空贴图来自
**[Solar System Scope](https://www.solarsystemscope.com/textures/)**，
以 **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)** 授权。

### 署名

> Textures by [Solar System Scope](https://www.solarsystemscope.com/textures/), licensed under CC BY 4.0.
> Modified: recompressed at reduced quality, split from packed RGB triplets into
> separate maps, resampled to multiple resolutions, and encoded as JPEG/PNG.

页面右下角已常驻显示该署名，转载本项目的截图时请不要裁掉它。

### 源文件与改动

| 用途 | 源文件 | 改动 |
|---|---|---|
| 太阳 | `8k_sun.jpg` | 重新压缩 |
| 水星 | `8k_mercury.jpg` | 重新压缩、降采样到 8K/4K/2K |
| 金星 | `4k_venus_atmosphere.jpg` | 重新压缩 |
| 地球 · 昼 | `8k_earth_daymap.jpg` | 100% 质量重压 |
| 地球 · 夜 | `8k_earth_nightmap.jpg` | 100% 质量重压 |
| 地球 · 法线 | `8k_earth_normal_map.tif` | TIFF → JPEG |
| 地球 · 云 | `8k_earth_clouds.jpg` | 转灰度单通道 |
| 地球 · 粗糙度 | `8k_earth_specular_map.tif` | 反相处理（高光图 → 粗糙度图）、TIFF → JPEG |
| 火星 | `8k_mars.jpg` | 重新压缩 |
| 木星 | `8k_jupiter.jpg` | 重新压缩 |
| 土星 | `8k_saturn.jpg` | 重新压缩 |
| 土星环 | `8k_saturn_ring_alpha.png` | 裁出顶部 64 行、面积平均 + 高斯模糊、输出 2K 宽 PNG |
| 月球 | `8k_moon.jpg` | 重新压缩 |
| 天王星 | `2k_uranus.jpg` | 重新压缩（源图本身只有 2K） |
| 海王星 | `2k_neptune.jpg` | 重新压缩（源图本身只有 2K） |
| 银河 | `8k_stars_milky_way.jpg` | 重新压缩 |

**注意**：官方 8K 文件并非全部真的是 8192×4096。实测只有地球、火星、水星、月球、
银河是 8K；太阳、木星、土星、金星是 4K；天王星、海王星最大 2K。
项目里的档位严格按实测尺寸设置，没有把 2K 图放大冒充 8K —— 详见 README「已知取舍」。

天王星和海王星的表面细节本身是**虚构**的（JPL 对大行星表面图明确标注 fictional，
真实观测只有低分辨率云带），这两颗星的纹理由程序化条带补充，不冒充真实测绘数据。

## 天文数据

轨道根数取自 JPL 的 *Keplerian Elements for Approximate Positions of the Major Planets*
（E. M. Standish, 表 1，J2000 黄道）。这是 NASA 公开数据，无使用限制。

精度验证脚本 `tools/verify-orbits.mjs` 的对照数据由 JPL Horizons 生成。
