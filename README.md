# EucliDraw Penrose 확장 (`jiwonme/euclidraw-penrose-extension`)

[Penrose](https://github.com/penrose/penrose)의 **.domain · .substance · .style** 세 소스 파일을 alid 캔버스 컴포넌트로 편집하는 외부 확장입니다. Penrose 다이어그램을 선택하면 인스펙터에 **Penrose 소스** 패널이 나타나고, 세 파일을 탭으로 나누어 수정한 뒤 한 번의 Undo로 적용할 수 있습니다. 결과는 DOM 미리보기와 **순수 벡터 SVG** 양쪽으로 렌더링됩니다.

## 주요 기능

- **캔버스 컴포넌트**: `diagram.penrose.diagram` 어스펙트가 `.domain`, `.substance`, `.style`, `variation`을 정본으로 저장합니다.
- **선택 시 소스 편집**: 컴포넌트를 선택하면 인스펙터의 **Penrose 소스** 패널에 세 파일 탭, 줄 번호, `variation` 입력, 적용/예제 복원/다시 렌더가 나타납니다.
- **한 번의 Undo**: 적용은 세 파일과 `variation`을 하나의 정본 트랜잭션과 하나의 Undo 그룹으로 기록합니다.
- **실제 Penrose 컴파일**: `@penrose/core`의 `compile` → `optimize` → `toSVG` 파이프라인을 사용합니다. MathJax 수식 라벨도 SVG로 변환됩니다.
- **순수 벡터 출판**: 캔버스 DOM이 마운트되지 않은 상태에서도 `renderSvg`가 Penrose SVG를 내보냅니다. 확장은 활성화 시 모든 Penrose 컴포넌트를 백그라운드로 컴파일해 캐시를 데웁니다.
- **안전한 오류 표시**: Penrose 파서/컴파일 오류를 캔버스와 패널에 이스케이프해 표시하고, 마지막 성공 소스는 덮어쓰지 않습니다.
- **기본 예제**: Penrose README의 집합론 오일러 다이어그램이 기본값으로 들어 있습니다.

## 설치

alid 워크벤치의 **확장 관리 → GitHub 저장소 설치**에 다음을 입력합니다.

```text
jiwonme/euclidraw-penrose-extension
```

설치 후 왼쪽 도구 선반의 **Penrose 다이어그램** 버튼이나 명령 팔레트의 `Penrose 다이어그램 추가`로 컴포넌트를 만듭니다. 컴포넌트를 선택하면 인스펙터에서 소스를 편집할 수 있습니다.

> 이 확장의 번들은 약 **4.1MB**입니다. alid의 저장소 설치 한도가 **5MiB 이상**인 호스트가 필요합니다. 개발 연결(`pnpm dev`)은 8MiB 한도를 사용합니다.

## 사용법

1. **Penrose 다이어그램** 도구로 캔버스에 컴포넌트를 만듭니다.
2. 컴포넌트를 선택합니다. 인스펙터에 **Penrose 소스** 섹션이 열립니다.
3. `.domain`, `.substance`, `.style` 탭에서 소스를 수정합니다.
4. **적용**(`Ctrl/⌘ + Enter` 또는 `Ctrl/⌘ + S`)을 누릅니다. 캔버스가 즉시 다시 컴파일됩니다.
5. 실패하면 패널과 캔버스에 Penrose 오류가 표시됩니다. 소스는 그대로 남아 있으니 고친 뒤 다시 적용하세요.
6. **예제 복원**은 기본 집합론 예제로 되돌리고, **다시 렌더**는 캐시를 버리고 현재 정본을 다시 컴파일합니다.

> `variation`은 Penrose 레이아웃의 난수 시드입니다. 같은 소스라도 값을 바꾸면 다른 배치가 나옵니다.

## 개발

Node.js 22.12 이상과 `pnpm@11.22.0`을 사용합니다.

```sh
pnpm install
pnpm test       # 배포 번들 빌드 + 계약 테스트
pnpm check:dist # 커밋된 dist/plugin.js·alid.extension.json 최신 여부
```

watch 개발 서버:

```sh
pnpm dev        # http://127.0.0.1:5174
```

alid의 **확장 관리 → 개발 중인 확장 연결**에 주소를 입력하고 승인하면, `src/` 저장 시 다시 빌드되어 캔버스에 반영됩니다. 개발 출력은 `.alid-dev/`에만 생성됩니다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `extension.json` | 확장 ID·버전·요약·커널 호환 범위 |
| `src/manifest.js` | 번들과 설치 명세가 공유하는 패키지 계약, 명령 ID |
| `src/defaults.js` | 기본 `.domain` · `.substance` · `.style` 예제, 소스 정규화·캐시 키 |
| `src/compile.js` | Penrose 컴파일·최적화·SVG 렌더 캐시, 오류 포맷 |
| `src/aspect.js` | `diagram.penrose.diagram` 어스펙트, 순수 `derive`, DOM/SVG 렌더 |
| `src/panel.jsx` | 선택 시 인스펙터에 마운트되는 소스 편집기 (React, 호스트 공유 모듈) |
| `src/index.js` | 명령 등록·생성·적용·복원·백그라운드 캐시 워밍 |
| `scripts/`, `test/`, `vite.config.js` | 단일 ESM 번들 빌드·watch·계약 검증 |

## 알려진 제한

- Penrose 스타일의 `import "파일"`은 지원하지 않습니다. 세 파일은 항상 한 컴포넌트 안에 자체 포함되어야 합니다.
- 컴파일은 호스트 메인 스레드에서 실행됩니다. 적용 시점에만 컴파일하므로 입력 중에는 캔버스를 다시 그리지 않습니다. 일반적인 예제는 100ms 안팎에 컴파일되지만, 매우 큰 스타일은 잠시 UI를 점유할 수 있습니다.
- `renderSvg`는 동기 계약이므로 아직 컴파일되지 않은 컴포넌트는 첫 호출에서 자리표시자를 반환할 수 있습니다. 확장은 활성화·문서 변경 시 백그라운드 컴파일로 이 창을 줄입니다.
- Penrose 3.3.1의 `@penrose/core`를 번들에 포함하므로 `dist/plugin.js`가 약 4.1MB(gzip 약 1.0MB)입니다.
- 이 확장은 승인 후 앱 안에서 실행되는 **신뢰 확장**입니다. `capabilities`는 접근 의도를 설명하며 DOM·네트워크를 격리하는 샌드박스가 아닙니다.

## 검증 범위

`pnpm test`는 실제 배포 번들을 import해 다음을 확인합니다.

- 설치 명세의 ID·버전·의존성·`provides`·SHA256 일치
- 어스펙트 기본값과 `textFields`, 인스펙터 패널 연결, 도구 선반 명령
- `canvas.creation`을 통한 생성과 `core.transform`/`core.bounds` 미중복 기록
- 적용/복원이 세 파일과 `variation`을 한 번의 Undo 그룹으로 기록하는지
- 순수 `derive`의 유한 폴백, `renderSvg` 자리표시자, 소스 키 안정성
- 호스트 공유 모듈 외 import가 번들에 남지 않는지

브라우저에서의 실제 설치·선택·편집·Undo·SVG 내보내기는 호스트 버전에 따라 수동으로 확인해야 합니다. 120fps·0-GC 성능 목표는 이 확장의 주장이 아닙니다.

MIT License.
