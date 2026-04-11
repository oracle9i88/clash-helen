# Clash Helen 使用说明书

## 目录

- [简介](#简介)
- [系统要求](#系统要求)
- [安装](#安装)
- [快速上手](#快速上手)
- [功能详解](#功能详解)
- [配置说明](#配置说明)
- [TUN 模式详解](#tun-模式详解)
- [快捷键设置](#快捷键设置)
- [从源码构建](#从源码构建)
- [常见问题](#常见问题)
- [文件路径说明](#文件路径说明)

---

## 简介

Clash Helen 是一个轻量级的代理客户端，基于 [Mihomo](https://github.com/MetaCubeX/mihomo)（原 Clash Meta）内核，专为 Ubuntu 20.04+ 优化。

### 支持的协议

| 协议            | 说明                   |
| --------------- | ---------------------- |
| **VLESS**       | V2Ray VLESS 协议       |
| **VMess**       | V2Ray VMess 协议       |
| **Hysteria 2**  | 基于 QUIC 的高性能代理 |
| **Shadowsocks** | 经典代理协议           |
| **Trojan**      | 基于 TLS 的代理协议    |
| **TUIC**        | 基于 QUIC 的代理协议   |
| **WireGuard**   | 现代 VPN 协议          |

以及 Mihomo 内核支持的所有其他协议。

### 核心功能

- **TUN 模式** — 通过虚拟网卡实现全局代理，无需逐个配置应用
- **系统代理** — 自动设置系统 HTTP/SOCKS5 代理
- **订阅管理** — 导入、自动更新、一键切换配置文件
- **路由模式** — 规则分流 / 全局代理 / 直连
- **系统托盘** — 快速切换代理、切换模式、复制环境变量
- **开机自启** — 通过 XDG autostart 实现开机启动
- **DNS 配置** — 支持 DoH / DoT 自定义 DNS
- **流量监控** — 实时上传/下载速度显示

---

## 系统要求

- **系统**: Ubuntu 20.04 及以上版本 （也支持 Debian 11+、Linux Mint 20+、其他基于 Debian 的发行版）
- **架构**: x86_64 (amd64) 或 ARM64 (aarch64)
- **桌面环境**: GNOME、KDE、XFCE 或任何支持系统托盘的桌面

---

## 安装

### 方式一：DEB 包安装（推荐）

从 [Releases](../../releases) 页面下载 `clash-helen-linux-amd64.deb`，然后：

```bash
sudo dpkg -i clash-helen-linux-amd64.deb
sudo apt install -f   # 如有依赖缺失，自动修复
```

### 方式二：AppImage（免安装）

```bash
chmod +x clash-helen-linux-amd64.AppImage
./clash-helen-linux-amd64.AppImage
```

### 方式三：RPM 包

Fedora / openSUSE 用户：

```bash
sudo rpm -i clash-helen-linux-amd64.rpm
```

### 运行时依赖

如果遇到缺少库的错误，安装：

```bash
sudo apt install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 \
  xdg-utils at-spi2-core libsecret-1-0
```

### 卸载

```bash
sudo apt remove clash-helen
```

---

## 快速上手

### 第一步：启动应用

安装后，从应用菜单启动 Clash Helen，或在终端运行：

```bash
clash-helen
```

应用图标会出现在**系统托盘**中。

### 第二步：导入订阅

1. 点击托盘图标打开主窗口
2. 进入「**订阅**」页面
3. 点击 **+** 按钮添加新订阅
4. 粘贴你的订阅链接（支持所有 Clash Meta 格式的订阅）
5. 点击「**保存**」— 订阅会自动下载并激活

> 支持的订阅格式：Clash/Clash Meta YAML 配置文件，包含 `proxies` 或 `proxy-providers` 字段。

### 第三步：开启代理

有三种方式使用代理：

#### 1. 系统代理（推荐浏览器等应用使用）

- 在托盘菜单或侧边栏开启「**系统代理**」
- 系统会自动设置 HTTP/HTTPS 代理为 `127.0.0.1:7890`

#### 2. TUN 模式（全局代理，推荐）

- 在托盘菜单或侧边栏开启「**TUN**」
- 首次使用会要求输入密码（需要创建虚拟网卡）
- TUN 模式会捕获**所有** TCP/UDP 流量，无需逐个应用配置

#### 3. 手动代理（针对特定应用）

在终端中设置环境变量：

```bash
export https_proxy=http://127.0.0.1:7890
export http_proxy=http://127.0.0.1:7890
export all_proxy=http://127.0.0.1:7890
```

也可以使用托盘菜单中的「**复制环境变量**」按钮。

### 第四步：选择路由模式

| 模式     | 说明                            | 适用场景                   |
| -------- | ------------------------------- | -------------------------- |
| **规则** | 根据规则分流（域名、IP、GeoIP） | 日常使用，国内直连国外代理 |
| **全局** | 所有流量走代理                  | 需要完全翻墙时             |
| **直连** | 所有流量直连                    | 临时关闭代理               |

在托盘菜单或主窗口中切换。

---

## 功能详解

### 订阅管理

- **添加订阅**：支持 URL 导入和本地文件导入
- **自动更新**：可为每个订阅设置更新间隔（秒）
- **手动更新**：点击订阅卡片上的刷新按钮
- **切换订阅**：点击订阅卡片即可切换当前使用的配置

### 代理节点

在「**代理**」页面：

- 查看所有代理组和节点
- 点击节点名称切换当前使用的代理
- 点击「**延迟测试**」测速所有节点
- 支持按名称搜索节点

### 连接管理

在「**连接**」页面：

- 查看当前所有活跃连接
- 查看每个连接的目标地址、使用的代理节点、速率等
- 可关闭单个或所有连接

### 覆写配置

在「**覆写**」页面，可以通过 JavaScript 脚本修改生成的 Mihomo 配置：

```javascript
function main(config) {
  // 修改配置
  config.dns['fake-ip-range'] = '198.18.0.1/16'
  return config
}
```

### 日志查看

在「**日志**」页面查看 Mihomo 内核的实时日志，可按级别过滤。

---

## 配置说明

### 代理端口

在「**内核**」页面配置（默认值）：

| 端口   | 协议          | 默认值 |
| ------ | ------------- | ------ |
| Mixed  | HTTP + SOCKS5 | 7890   |
| SOCKS5 | 仅 SOCKS5     | 7891   |
| HTTP   | 仅 HTTP       | 7892   |

### 通用设置

在「**设置**」页面可配置：

- **语言**：简体中文 / 繁体中文 / English / Русский / فارسی
- **开机自启**：开关
- **静默启动**：启动时不显示主窗口
- **主题**：暗色 / 亮色 / 跟随系统
- **自定义主题**：CSS 主题，支持导入和编辑
- **托盘设置**：是否显示托盘图标、托盘颜色等

### DNS 设置

在「**DNS**」页面：

- 启用/禁用 DNS 劫持
- 配置 DNS 服务器（支持 `tls://`、`https://`、普通 DNS）
- 配置 fallback DNS
- 配置域名策略（nameserver-policy）

---

## TUN 模式详解

TUN 模式通过创建虚拟网卡接口，捕获系统所有的网络流量，实现真正的全局代理。

### 工作原理

1. Mihomo 内核创建一个虚拟网卡（如 `Meta`）
2. 修改系统路由表，将所有流量导向这个虚拟网卡
3. Mihomo 内核根据规则处理所有经过的流量

### 权限要求

TUN 模式需要 root 权限。Clash Helen 会通过 `pkexec` 自动请求权限。

首次启用时会执行：

```bash
sudo setcap cap_net_bind_service,cap_net_admin,cap_dac_override=+ep \
  /opt/clash-helen/resources/sidecar/mihomo
```

如果自动授权失败，可以在「**内核**」页面手动点击「**授予内核权限**」。

### 注意事项

- 开启 TUN 后系统的 DNS 会被接管（自动启用 DNS 模块）
- 如果同时开启系统代理和 TUN，托盘图标会变红作为提醒
- 关闭 Clash Helen 后 TUN 会自动释放

---

## Hysteria 2 端口跳跃

端口跳跃（Port Hopping）是 Hysteria 2 协议的重要特性，可以有效防止运营商对固定 UDP 端口的封锁和限速。

### 工作原理

1. 客户端周期性地在指定端口范围内切换目标端口发送 QUIC 数据包
2. 服务器通过 iptables DNAT 规则将所有端口的流量转发到实际监听端口
3. 运营商无法通过单一端口特征识别和封锁连接

### 客户端配置（Clash Helen）

在「**内核**」页面底部找到 **Hysteria 2** 设置区域：

1. 开启「**Hysteria 2 端口跳跃**」开关
2. 设置**端口范围**（默认 `20000-40000`），需与服务器端 iptables 规则一致
3. 设置**跳跃间隔**（默认 `30` 秒），建议保持 30 秒

开启后，所有订阅中的 Hysteria 2 节点会自动注入端口跳跃参数。如果节点配置中已有 `ports` 字段，则不会被覆盖。

### 服务器端配置

服务器需要设置 iptables DNAT 规则，将端口范围内的流量转发到 Hysteria 2 实际监听端口。

假设 Hysteria 2 服务端监听在 `443` 端口，端口范围为 `20000-40000`：

```bash
# IPv4
iptables -t nat -A PREROUTING -i eth0 -p udp --dport 20000:40000 -j DNAT --to-destination :443

# IPv6（如需要）
ip6tables -t nat -A PREROUTING -i eth0 -p udp --dport 20000:40000 -j DNAT --to-destination :443
```

使规则持久化：

```bash
# Debian/Ubuntu
sudo apt install iptables-persistent
sudo netfilter-persistent save

# CentOS/RHEL
sudo service iptables save
```

### 注意事项

- 端口范围需要在服务器防火墙中放行对应的 UDP 端口
- 客户端和服务器的端口范围必须一致
- 跳跃间隔建议 30 秒，过短可能增加握手开销
- 如果使用云服务商（如 AWS、GCP），需要在安全组中放行 UDP 端口范围

---

## 快捷键设置

在「**设置 → 快捷键**」中配置全局快捷键：

| 功能         | 说明                     |
| ------------ | ------------------------ |
| 显示窗口     | 显示/隐藏主窗口          |
| 切换系统代理 | 开启/关闭系统代理        |
| 切换 TUN     | 开启/关闭 TUN 模式       |
| 规则模式     | 切换到规则分流           |
| 全局模式     | 切换到全局代理           |
| 直连模式     | 切换到直连               |
| 轻量模式     | 退出应用但保持内核运行   |
| 重启应用     | 重启 Clash Helen         |
| 复制环境变量 | 复制代理环境变量到剪贴板 |

设置方式：点击输入框，按下你想要的组合键（如 `Ctrl+Shift+P`），然后点击确认。按 `Backspace` 清除快捷键。

---

## 从源码构建

### 环境准备

```bash
# 安装 Node.js 22+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install nodejs

# 安装 pnpm
npm install -g pnpm
```

### 构建步骤

```bash
git clone <repo-url> clash-helen
cd clash-helen
pnpm install
pnpm prepare         # 下载 mihomo 内核和资源文件
pnpm build:linux     # 构建 DEB、RPM 和 AppImage
```

构建产物在 `dist/` 目录下。

### 开发模式

```bash
pnpm install
pnpm prepare
pnpm dev             # 启动开发模式，支持热重载
```

---

## 常见问题

### 应用无法启动

```bash
# 检查是否有其他实例在运行
ps aux | grep clash-helen

# 在终端中启动查看错误输出
clash-helen --no-sandbox
```

### TUN 模式无法开启

```bash
# 检查内核权限
ls -la /opt/clash-helen/resources/sidecar/mihomo

# 重新授权
sudo setcap cap_net_bind_service,cap_net_admin,cap_dac_override=+ep \
  /opt/clash-helen/resources/sidecar/mihomo
```

### 系统代理未生效

```bash
# 检查当前系统代理设置
env | grep -i proxy

# 手动测试代理是否工作
curl -x http://127.0.0.1:7890 https://www.google.com
```

### 订阅下载失败

- 检查订阅链接是否可访问
- 尝试在订阅设置中开启「使用代理下载」
- 调整超时时间（设置中 → 订阅超时时间）
- 检查网络连接是否正常

### 节点延迟测试超时

- 默认测试 URL 为 `https://www.gstatic.com/generate_204`
- 可在内核设置中自定义测试 URL 和超时时间
- 如果所有节点超时，检查代理服务器是否正常

### 如何查看日志

- 应用内：进入「**日志**」页面
- 文件系统：`~/.config/clash-helen/logs/`

---

## 文件路径说明

| 路径                                  | 说明                     |
| ------------------------------------- | ------------------------ |
| `~/.config/clash-helen/`              | 配置根目录               |
| `~/.config/clash-helen/config.yaml`   | 应用配置                 |
| `~/.config/clash-helen/profiles/`     | 订阅配置文件             |
| `~/.config/clash-helen/override/`     | 覆写脚本                 |
| `~/.config/clash-helen/themes/`       | 自定义主题               |
| `~/.config/clash-helen/logs/`         | 日志文件                 |
| `/opt/clash-helen/`                   | 应用程序文件（DEB 安装） |
| `/opt/clash-helen/resources/sidecar/` | Mihomo 内核二进制文件    |

---

## 致谢

- [Mihomo](https://github.com/MetaCubeX/mihomo) — 代理内核引擎（原 Clash Meta）
- [Mihomo Party](https://github.com/mihomo-party-org/mihomo-party) — 原始 GUI 项目

## 许可证

[GPL-3.0](LICENSE)
