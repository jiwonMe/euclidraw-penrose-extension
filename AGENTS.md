# AGENTS.md — EucliDraw Penrose 확장 개발 지침

이 저장소는 alid 앱이나 커널이 아니라, GitHub에서 설치하는 **독립 외부 확장**입니다. Penrose의 세 소스 파일을 캔버스 컴포넌트로 편집하고 순수 벡터 SVG로 렌더링합니다.

> 작은 코어, 기능은 확장으로. 문서에는 사용자 의도만, 호스트와의 연결은 공개 계약만.

## 1. 작업 전 읽기

1. [README.md](README.md): 설치·사용법·개발 흐름과 알려진 제한.
2. [extension.json](extension.json), [src/manifest.js](src/manifest.js): 패키지 계약과 명령 ID.
3. [src/defaults.js](src/defaults.js), [src/compile.js](src/compile.js): Penrose 소스와 컴파일 캐시.
4. [src/aspect.js](src/aspect.js), [src/panel.jsx](src/panel.jsx): 어스펙트·인스펙터 편집기.
5. [src/index.js](src/index.js): 명령·생성·적용·백그라운드 워밍.

이 저장소에는 alid 모노레포나 Rust/Wasm 빌드가 없다. 호스트 서비스·DOM 구조를 추측해 우회하지 말고, 공개 `ExtensionPackageSpec` 계약만 사용한다.

## 2. 파일별 책임

| 파일 | 책임 / 수정 원칙 |
| --- | --- |
| `extension.json` | 확장 ID·제목·버전·요약·커널 호환 범위의 원본. |
| `src/manifest.js` | 번들과 설치 명세가 공유하는 계약. `provides.aspects`는 `${id}.diagram`. |
| `src/defaults.js` | 기본 `.domain` · `.substance` · `.style` 예제, 소스 정규화·캐시 키. |
| `src/compile.js` | `compile → optimize → toSVG` 파이프라인, LRU 캐시, 오류 포맷. |
| `src/aspect.js` | `diagram.penrose.diagram` 어스펙트, 순수 `derive`, DOM/SVG 렌더. |
| `src/panel.jsx` | 선택 시 인스펙터에 마운트되는 세 파일 편집기. React는 호스트 공유 모듈. |
| `src/index.js` | 명령 등록·생성·적용·복원·다시 렌더·백그라운드 캐시 워밍. |
| `scripts/` | 단일 ESM 번들 빌드, watch 서버, 설치 manifest·SHA256, 설정 검증. |
| `test/*.test.mjs` | 번들 계약·생성·Undo·파생·SVG 자리표시자·소스 키 회귀. |
| `dist/plugin.js`, `alid.extension.json` | **Git에 포함하는 생성 산출물. 직접 편집하지 않고 `pnpm build`로 갱신한다.** |

## 3. 개발·검증

Node.js **22.12 이상**, `pnpm@11.22.0`.

```sh
pnpm install --frozen-lockfile
pnpm test          # 배포 번들 빌드 + 모든 Node 계약 테스트
pnpm check:dist    # 재빌드 후 커밋된 산출물과 차이가 없는지 확인
pnpm dev           # http://127.0.0.1:5174 watch 서버
```

- `pnpm dev` 주소를 alid의 **확장 관리 → 개발 중인 확장 연결**에서 승인해 연결한다. 기본 허용 출처는 `http://127.0.0.1:5173`, `http://localhost:5173`이다.
- 다른 호스트 출처는 `pnpm dev --origin https://alid.example`로 추가한다. 포트는 `--port`로 바꾼다.
- 개발 출력은 `.alid-dev/`에만 생성된다. 커밋할 `dist/plugin.js`는 `pnpm build` 전까지 바뀌지 않는다.

## 4. 번들·설치 계약

- 기본 export는 `ExtensionPackageSpec` 형태다. 번들과 설치 명세의 `id`, `version`, `engine`, `dependencies`, `optionalDependencies`, `conflicts`, `provides`는 일치해야 한다.
- 설치 형식은 `apiVersion: 2`. `engine`은 커널 호환 범위, `extension.json.version`은 확장 릴리스 버전이다.
- 설치 코드는 **Blob URL**에서 실행된다. 출력은 하나의 `dist/plugin.js`이며 상대 경로 청크·별도 CSS·에셋·런타임 npm 설치에 의존하면 안 된다.
- 호스트 공유 모듈은 `vite.config.js`의 정확한 목록만 외부화한다: `react`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `react-dom`, `react-dom/client`, `@alid/react`, `@alid/kernel`.
- `@penrose/core`는 번들에 포함한다. 이 때문에 `dist/plugin.js`가 약 4.1MB(gzip 약 1.0MB)이며, 이는 의도된 트레이드오프다.
- `capabilities`는 실제 읽기/쓰기 어스펙트·서비스·명령 의도를 반영한다. SHA256을 수동으로 적거나 해시 검사를 끄지 않는다.

## 5. 데이터·렌더 불변식

1. **저장되는 것은 사용자 의도뿐이다.** `domain`, `substance`, `style`, `variation`만 정본 어스펙트에 둔다. 컴파일 결과 SVG·측정값·함수·DOM 노드·타이머·Blob URL을 저장하지 않는다.
2. **읽기와 활성화는 문서를 바꾸지 않는다.** 설치·API 조회·`derive`·렌더링·백그라운드 워밍·비활성화는 정본을 쓰지 않는다. 쓰기는 **적용/복원** 명령에서만 한다.
3. **`derive(props, id, view)`는 순수 함수다.** `core.transform`·`core.bounds`만 읽고 유한한 기하를 반환한다. 컴파일·DOM·네트워크 접근 금지.
4. **한 번의 Undo.** 적용은 세 파일과 `variation`을 하나의 `applyCanonicalTransaction`과 `host.history` 그룹으로 기록한다. `core.transform`·`core.bounds`를 중복 작성하지 않는다.
5. **세 파일은 자체 포함.** Penrose 스타일 `import "파일"`은 지원하지 않는다. 파일 시스템·네트워크에서 소스를 가져오지 않는다.
6. **순수 SVG 출판.** `renderSvg`는 동기 계약이므로 렌더 캐시가 비어 있으면 자리표시자를 반환하고 백그라운드 컴파일을 시작한다. 활성화·문서 변경 시 캐시를 데워 화면 밖 객체도 내보낼 수 있게 한다.
7. **SVG id는 엔티티별 네임스페이스.** Penrose의 path/clip id 충돌을 막기 위해 `penrose-<entityId>`를 `toSVG`에 전달한다.
8. **사용자 문자열은 이스케이프.** 오류 메시지·aria-label·자리표시자 텍스트를 DOM/SVG에 넣을 때 `escapeXml`을 거친다. Penrose가 생성한 SVG만 `innerHTML`에 넣는다.

## 6. 편집기·입력

- 컴포넌트 선택 시 `inspectorFor` 패널이 나타난다. `inspectorFor` 패널에는 별도 `navigation`을 선언할 수 없다(호스트 검증 규칙).
- 소스 편집기는 제어된 `<textarea>`와 줄 번호 거터를 쓴다. `Tab`은 두 칸, `Shift+Tab`은 두 칸 제거, `Ctrl/⌘+Enter`·`Ctrl/⌘+S`는 적용이다.
- 한글/CJK IME 조합 중 `Enter`·`Escape`·도구 키를 가로채지 않는다. 텍스트 입력창의 네이티브 Undo·클립보드를 전역 리스너로 덮어쓰지 않는다.
- 적용 전 소스는 로컬 초안이며 문서에 쓰지 않는다. 외부 변경(Undo 등)과 초안이 충돌하면 "불러오기" 배너로 사용자에게 맡긴다.

## 7. 완료 전 확인

- [ ] 요청 범위만 수정했고 기존 어스펙트 ID·필드 의미를 보존했는가?
- [ ] 기능 변경에 맞는 `test/*.test.mjs`와 README를 갱신했는가?
- [ ] `pnpm test`로 실제 배포 번들·설치 계약·SHA256을 검증했는가?
- [ ] `pnpm check:dist`가 통과하도록 `dist/plugin.js`, `alid.extension.json`을 함께 커밋했는가?
- [ ] 활성화만으로 문서를 쓰지 않고, 적용/복원만 정본을 쓰는가?
- [ ] Penrose 오류가 캔버스와 패널에 이스케이프되어 표시되는가?
- [ ] 화면 밖 객체도 `renderSvg`로 내보낼 수 있는가?

Node 테스트는 모의 호스트와 번들 계약 검증이지 실제 브라우저·IME·Loro Undo 통합 검증이 아니다. 완료 보고에는 실행한 명령과 결과, 수동 확인 여부, 미검증 범위를 구분한다. 계측 없이 120fps·0-GC를 달성했다고 주장하지 않는다.
