# BLACKOUT — PDF 영역 삭제

PDF에서 영역을 드래그하고, 삭제될 이미지와 글자를 확인한 뒤 새 PDF로 저장하는 웹 도구입니다. **문서는 서버에 업로드하지 않고 브라우저에서 처리합니다.**

## 빠른 시작

이 ZIP에는 PDF 엔진, OCR 엔진, 한국어·영어 언어 데이터가 포함되어 있습니다. 실행을 위한 패키지 설치나 빌드는 필요하지 않습니다.

Node.js 20 이상이 설치되어 있다면, 이 README가 있는 폴더에서 실행하세요.

```bash
npm start
```

브라우저에서 **http://localhost:8000** 을 엽니다. 종료하려면 터미널에서 `Ctrl+C`를 누릅니다.

Python으로 실행할 수도 있습니다.

```bash
# macOS / Linux
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist

# Windows
py -m http.server 8000 --bind 127.0.0.1 --directory dist
```

HTML을 더블클릭하는 `file://` 방식은 Web Worker와 WebAssembly를 정상적으로 불러올 수 없어 지원하지 않습니다.

## 사용 방법

1. **PDF 열기**를 누르거나 파일을 화면에 끌어다 놓습니다.
2. 지우려는 영역을 드래그합니다.
3. 원본 영역 이미지와 삭제 대상 글자를 확인합니다. 스캔 문서는 **스캔 이미지의 글자도 인식하기**를 눌러 한국어·영어 OCR을 실행할 수 있습니다.
4. 확인란을 체크하고 **확인한 영역에 추가**를 누릅니다.
5. 필요한 만큼 영역을 추가합니다. 다른 페이지에서도 선택할 수 있고, 저장 전 목록에서 영역을 취소할 수 있습니다.
6. 저장 방식을 고르고 **삭제 적용 · PDF 저장**을 누릅니다.

출력 파일 이름에는 `_redacted.pdf`가 붙습니다. 원본 파일은 수정하지 않습니다. 샘플 문서로 체험할 수도 있습니다.

## 저장 방식

| 방식 | 동작 | 검색·복사 |
| --- | --- | --- |
| **안전 저장 · 이미지 PDF** (기본값) | 삭제 적용 후 모든 페이지를 최대 180dpi 이미지로 재구성합니다. 원본 텍스트·첨부파일·이전 저장 이력·문서 메타데이터는 출력에 포함하지 않습니다. | 불가 |
| **텍스트 유지 · 일반 PDF** | 선택한 영역의 이미지 픽셀과 텍스트를 실제 삭제하고, 나머지 페이지 내용을 새 PDF에 복사합니다. | 남은 글자 검색·복사 가능 |

텍스트 유지 방식에서 다른 위치에 같은 이미지가 재사용되거나 복잡한 레이어가 있는 문서는 추가 검토가 필요합니다. 확실한 재구성이 필요하면 안전 저장을 사용하세요. 매우 큰 페이지는 메모리 사용량을 제한하기 위해 해상도가 낮아질 수 있습니다.

OCR은 **내용 확인용**입니다. OCR로 인식한 문자열을 찾아 삭제하는 방식이 아니라, 사용자가 선택한 영역을 삭제합니다. 확인창의 일반 텍스트는 분리된 사본에 실제 삭제를 적용한 전후 결과를 비교해서 표시합니다.

## GitHub에 올리기

압축을 풀고 **`pdf-blackout` 폴더 안의 파일과 폴더**를 저장소 최상위에 올리세요. ZIP 파일 자체를 올리는 방식이 아닙니다.

터미널을 사용한다면, GitHub에서 빈 저장소를 만든 뒤 아래처럼 올릴 수 있습니다. 마지막 주소는 본인의 저장소 주소로 바꾸세요.

```bash
git init
git add .
git commit -m "Initial commit: PDF Blackout"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pdf-blackout.git
git push -u origin main
```

PDF/OCR 엔진이 포함된 `dist/vendor/`도 함께 커밋해야 압축을 푼 직후 실행할 수 있습니다. `.gitignore` 파일도 포함되어 있습니다. `node_modules/`와 테스트 임시 출력은 제외됩니다.

호스팅할 때는 `dist/`를 정적 웹사이트 루트로 사용하세요. 별도의 API 서버나 데이터베이스는 필요하지 않습니다. `.mjs`는 JavaScript, `.wasm`은 `application/wasm` MIME 타입으로 제공해야 합니다. GitHub 업로드만으로 웹사이트가 자동 공개되지는 않습니다.

## 프로젝트 구조

| 경로 | 내용 |
| --- | --- |
| `dist/index.html`, `dist/style.css` | 편집 화면과 반응형 스타일 |
| `dist/app.mjs` | 파일 선택, 드래그, 확인, OCR, 다운로드 |
| `dist/pdf-worker.mjs` | PDF 전용 Web Worker |
| `dist/pdf-core.mjs` | 실제 삭제 및 PDF 저장 엔진 |
| `dist/sample.pdf` | 가상 데이터 샘플 |
| `dist/source.zip` | 화면 내 소스 다운로드용 경량 패키지 |
| `dist/vendor/` | PDF/OCR 엔진과 언어 데이터 |
| `scripts/serve.mjs` | 의존성 없는 로컬 정적 서버 |
| `scripts/prepare-assets.mjs` | npm 패키지로 엔진 파일 재생성 |
| `scripts/create-fixtures.py` | 샘플 및 검증용 PDF 생성 |
| `tests/pdf-core.test.mjs` | PDF 엔진 검증 |
| `package.json`, `package-lock.json` | Node.js 명령과 의존성 버전 |
| `requirements-dev.txt` | 검증용 Python 패키지 |
| `LICENSE`, `README.md` | 라이선스와 사용 설명 |

## 개발 및 검증

일반 실행에는 아래 설치 과정이 필요하지 않습니다. 개발용 패키지를 설치하거나 엔진 파일을 재생성할 때 사용하세요.

```bash
npm ci
npm run prepare:assets
```

PDF 엔진 검증에는 Python 패키지가 추가로 필요합니다. 가상환경을 권장합니다.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python scripts/create-fixtures.py
npm test
```

Windows에서는 가상환경 생성에 `py -m venv .venv`, 활성화에 `.venv\Scripts\Activate.ps1`을 사용할 수 있습니다.

검증 항목:

- 선택 영역의 실제 글자 삭제와 나머지 글자 유지
- 이미지 일부의 픽셀 삭제
- 안전 저장 PDF의 원본 텍스트 배제 및 페이지 이미지 재구성
- 회전 페이지에서 선택·삭제 위치 유지
- 경계에 걸친 글자의 실제 삭제 결과와 확인창 내용 일치
- 미확인 영역의 저장 거부와 원본 보존

위 PDF 엔진 검증 6개와 한국어·영어 OCR 엔진 로딩·인식 검증을 통과했습니다. 로컬 서버의 HTML·JavaScript·WASM·OCR 데이터 제공, 허용 HTTP 메서드 및 경로 접근 제한도 확인했습니다. 브라우저 화면 렌더링과 마우스 조작을 통한 종단간 검증은 제작 환경의 제약으로 수행하지 못했습니다.

## 현재 범위

- 입력 PDF 최대 100 MB. 대형 문서 처리 가능 여부는 사용자 PC의 메모리에도 영향을 받습니다.
- 작업 상태는 이 탭의 메모리에 있으며, 새로고침하거나 탭을 닫으면 사라집니다.
- 기존 주석·양식의 보이는 모습은 출력에 반영하지만 인터랙티브 기능과 전자서명은 유지하지 않습니다.
- 인식 가능한 암호를 입력해 암호화된 PDF를 열 수 있습니다. 출력은 별도의 암호 없이 저장됩니다.
- 로그인·자동 저장·협업 기능은 포함하지 않습니다.

## 라이선스

이 프로젝트는 **AGPL-3.0-or-later**로 제공됩니다. 라이선스 전문은 `LICENSE`를 확인하세요.

- [MuPDF 1.28.1](https://github.com/ArtifexSoftware/mupdf/tree/1.28.1): Artifex, AGPL-3.0-or-later
- [Tesseract.js 6.0.1](https://github.com/naptha/tesseract.js/tree/v6.0.1): Apache-2.0
- [Tesseract.js Core](https://github.com/naptha/tesseract.js-core): Apache-2.0

포함된 라이선스와 고지 파일은 `dist/vendor/`에서 확인할 수 있습니다. 샘플 문서의 이름과 연락처는 기능 체험을 위한 가상 데이터입니다.
