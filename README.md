# NTNU Course Schedule

NTNU Course Schedule 是一個可直接部署到 GitHub Pages 的師大課程規劃網站。使用者可以在線上搜尋課程、加入個人規劃、檢查衝堂、匯出/匯入 CSV，並依學期獨立保存規劃內容。

https://monjo123.github.io/NTNUCourseSchedule/

<img width="3071" height="2744" alt="FireShot Capture 002 - NTNU 選課規劃系統 -  monjo123 github io" src="https://github.com/user-attachments/assets/a0ca2502-e837-4629-8ae9-2718c143b895" />

### 功能

- 課程搜尋與篩選：可依關鍵字、系所、課程類型與排序方式快速找課。
- 規劃清單：加入課程後會自動計算學分與衝突。
- 週課表檢視：以星期與節次顯示已選課程。
- 時段勾選：可勾選多個時段，只顯示完全落在勾選範圍內的課程。
- 學期支援：內建 113-1、113-2、114-1、114-2，切換學期會分開保存規劃。
- CSV 匯出/匯入：匯出時會包含學期資訊；匯入時會檢查課程是否存在、時間是否完整，並可自動切換到檔案內學期。

### 使用方式

1. 開啟網站後，在「學期」下拉選單選擇要查詢的學期。
2. 使用搜尋條件找到課程，加入規劃。
3. 若要限制顯示結果，可使用「時段勾選」選取多個節次與星期。
4. 進入「我的規劃」頁籤查看週課表、總學分與衝突。
5. 可使用 CSV 匯出/匯入保存或還原規劃。

### CSV 匯入 / 匯出

- 匯出檔案第一列會包含 `SEMESTER` 標頭，例如 `SEMESTER,114-2`。
- 匯入時若檔案學期與目前學期不同，系統會詢問是否自動切換並清空目前規劃。
- 匯入時會忽略不存在的課程，以及時間欄位不完整的課程，並顯示警告。

## 本地部屬

### 資料來源

課程資料會優先讀取學期資料夾中的檔案：

- `public/113_1/courses.json`
- `public/113_2/courses.json`
- `public/114_1/courses.json`
- `public/114_2/courses.json`

如果對應檔案不存在，程式會退回使用舊格式資料來源。

### 更新資料

如果你要重新抓取課程資料，請先安裝依賴，再執行抓取腳本：

```bash
npm install
npm run fetch
```

執行後會更新各學期資料夾中的 `courses.json`。

### 本機預覽

GitHub Pages 使用的是靜態檔案，所以本機預覽也建議用靜態伺服器開啟，不要直接雙擊 `index.html`。

例如：

```bash
npx serve .
```

或使用 VS Code Live Server。


## 專案結構

```text
index.html
package.json
public/
  113_1/
    courses.json
  113_2/
    courses.json
  114_1/
    courses.json
  114_2/
    courses.json
scripts/
  fetch.js
  planner.js
```

## 備註

- 規劃內容會依學期分開儲存在瀏覽器本機資料中。
- 課程資料若有更新，建議先重新執行 `npm run fetch` 再重新整理頁面。
