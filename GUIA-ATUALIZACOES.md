# Guia de atualizações (GitHub)

## Uma vez só (preparação)
1. Crie uma conta em github.com e um repositório **público** chamado `BuscaConquista` (botão *New*; marque *Public*). Público é necessário para o programa consultar as Releases sem login.
2. O `package.json` já está com `"updateRepo": "rodrigopaduab/BuscaConquista"`; basta criar o repositório com esse nome.
3. Gere o instalador/.exe da versão **0.8.0** (`Gerar-instalador.bat`) e passe aos amigos. Essa é a última vez que eles precisam instalar.
4. Na página do repositório: *Releases* > *Draft a new release* > tag `v0.8.0` > marque **Set as a pre-release** > anexe o instalador se quiser guardá-lo > *Publish release*. (Esta release inicial não precisa de app.asar.)

## A cada correção
1. Altere o código, aumente a versão em `package.json` (ex.: 0.8.1) e adicione a entrada em `src/changelog.js`.
2. Dê dois cliques em `Gerar-update.bat`. Abre a pasta `dist-update` com `app.asar` e `update.json`.
3. No GitHub: *Releases* > *Draft a new release* > *Choose a tag* > digite `v0.8.1` > *Create new tag*.
4. Marque **Set as a pre-release** (enquanto estiver em testes).
5. Arraste `app.asar` e `update.json` para a área de anexos.
6. *Publish release*.

Os amigos recebem o aviso "Atualização pronta" na próxima abertura (ou em até 6 h) e clicam em *Reiniciar agora*. Também dá para forçar em Configurações > Atualizações.

## Observações
- Só o código muda (~0,5 MB). Se trocar a versão do Electron no `package.json`, é preciso um novo instalador completo (o programa avisa).
- Se uma atualização travar ao abrir, o programa volta sozinho para a versão instalada.
- Quando o beta estiver estável, publique sem marcar *pre-release*: quem escolheu "Só versões estáveis" passa a receber.
