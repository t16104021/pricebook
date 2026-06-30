# iOS Native App Setup

這個專案可以用 Capacitor 包成自己使用的 iPhone App。

## 目前已完成

- 新增 `package.json`
- 新增 `capacitor.config.json`
- 新增 `scripts/build-capacitor.mjs`
- `npm install` 已安裝 Capacitor 套件
- `npm run build` 可產生 App 用的 `www/` 靜態檔

## 你的 Mac 還需要安裝

1. 從 App Store 安裝 Xcode。
2. 安裝完成後打開 Xcode 一次，讓它完成初始設定。
3. 在 Terminal 執行：

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -runFirstLaunch
brew install cocoapods
```

## 建立 iOS App

完成上面的本機環境後，在專案資料夾執行：

```bash
npm run cap:add:ios
npm run cap:open:ios
```

Xcode 開啟後：

1. 接上 iPhone。
2. 選擇你的 iPhone 作為執行裝置。
3. 到 Signing & Capabilities 選你的 Apple ID Team。
4. 按 Run 安裝到手機。

## 自己使用的限制

- 免費 Apple ID 通常適合測試與自己用。
- 若要長期穩定安裝、多人使用或上架，需要 Apple Developer Program。
- App 仍使用 Supabase 雲端登入與資料庫，不會把資料存進 iPhone 原生資料庫。
