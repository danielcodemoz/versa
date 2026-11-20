# Versa para Windows

A app Tauri 2 abre a mesma roda do site com WebView2. A janela do gesto fica junto ao cursor, com um indicador de arrasto e acções compatíveis. Arrasta um ficheiro no Explorador ou no Ambiente de Trabalho, toca em Shift depois de começar a mover e passa por uma categoria para abrir as acções. Larga numa acção para guardar o resultado junto do primeiro original. Guardar de novo cria um novo nome e preserva os ficheiros existentes.

O ícone na área de notificação abre a janela principal. A janela tem histórico, tema, idioma e opções de arranque, som e pasta. A notificação Feito pode abrir o resultado ou seleccioná-lo no Explorador. O Versa abre com permissões normais. O motor volta a arrancar em segundo plano após 40 resultados ou quando os processos excedem 1 GiB, assim que acabam as conversões em curso.

Para Word, Excel e PowerPoint → PDF, o Versa tenta o Microsoft Office ou LibreOffice da máquina e recorre ao motor local quando necessário. O motor recebe apenas ficheiros escolhidos ou largados na roda.

## Desenvolvimento Windows

Instala Node.js 24, Rust estável com destino `x86_64-pc-windows-msvc`, Microsoft C++ Build Tools com Windows SDK e WebView2. Na raiz do repositório, corre `npm ci`.

- Para desenvolvimento, abre `npm run dev -- --host 127.0.0.1 --strictPort` num terminal e `npm run desktop:dev` noutro.
- Para compilar e empacotar em Windows, usa `npm run desktop:build -- --target x86_64-pc-windows-msvc --bundles nsis,msi`. Os instaladores aparecem em `apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle`, nas pastas `nsis` e `msi`.
- Para testes Rust, usa `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`.
- Para verificar o gesto manualmente, abre o Explorador numa conta normal, arrasta um PDF, toca em Shift, passa sobre PDF e larga sobre Para texto. Confirma o ficheiro `(Versa).txt` ao lado do original, abre-o pela notificação e repete com Shift premido antes de começar a arrastar.


## Publicação

O workflow **Windows installers** compila em `windows-latest`. Os builds de PR e manuais geram o artefacto `versa-windows-x64`. Uma tag com a versão do `tauri.conf.json`, como `v0.1.0`, publica as somas SHA-256, o NSIS `Versa-Setup-0.1.0.exe` e o MSI `Versa-0.1.0-x64.msi` em GitHub Releases.

O NSIS instala para o utilizador actual. A página `/downloads/` encaminha para os instaladores públicos. O repositório guarda a configuração e o site estático.
