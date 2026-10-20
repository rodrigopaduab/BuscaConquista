# BuscaConquista

Mostra as conquistas que faltam nos seus jogos da Steam (nomes em português e inglês, porcentagem global, progresso).
Só Windows, por enquanto. O histórico completo também aparece em Configurações > Novidades.

## Novidades da versão 0.8.0

- Atualização automática: o programa procura versões novas nas Releases do GitHub (ao abrir e a cada 6 horas), baixa só o código (cerca de 0,5 MB) e avisa para reiniciar. Se uma atualização travar ao abrir, volta sozinho para a versão instalada.
- Nova aba Configurações > Atualizações: botão para procurar agora, opção de desligar a busca automática e escolha entre receber versões beta (testes) ou só estáveis.
- Esta é a primeira versão beta (pré-lançamento) aberta aos testadores.

## Novidades da versão 0.7.37

- Revisão geral do código: corrigidas lentidões em páginas enormes (tempo do HowLongToBeat, títulos de DLC e etiquetas), gravação de cache e perfil mais segura contra quedas, e importação de dados mais rígida.
- Ao abrir outro jogo, a busca do anterior para na hora e não disputa a internet com a nova.
- Barra de categorias com várias cores: a faixa à direita da conquista mostra uma cor para cada etiqueta (final, perdível, dificuldade, bugada).
- Nome da DLC sem o nome do jogo ("Legacy of the First Blade", e não "Assassin's Creed Odyssey – Legacy of the First Blade").
- Mapa de outro jogo: agora só vale o mapa cujo endereço ou título cita o jogo (acabou o caso de "Titan Quest 2" aparecer no Binding of Isaac); mapas já guardados são conferidos de novo.
- Mapas mais completos: o Gamepressure agora é procurado de até 3 formas (o Bing varia), um mapa já achado não some, e lista incompleta é refeita depois de 1 dia. O diagnóstico mostra o resultado de cada site de mapa.
- Sites que pedem verificação anti-robô e agora vêm bloqueados de fábrica: trophieshunter.com, keengamer.com e ludo.guide.
- A linha final da busca mostra quanto tempo a pesquisa levou (ex.: "pesquisa levou 42 s").
- Nova etapa "Mapas" na barra de pesquisa (a busca de mapas interativos já acontecia, mas sem aparecer), e "Base e DLCs" passou a se chamar só DLCs.
- Barra de pesquisa mais limpa: ao terminar, sem a barra verde, sem número de conquistas e sem horas; mostra só o resultado (DLCs, sites consultados, etiquetas) em texto que quebra linha e não fica cortado; recolhida, mostra a mesma coisa em versão curta, numa linha só. Removidos também os destaques "Finais: faltam…" do cabeçalho.
- Resumo do guia dentro do cabeçalho: agora fica logo abaixo da barra de pesquisa, com o mesmo fundo e o mesmo visual.
- Filtros de etiqueta corretos: os números (Finais, Dificuldade, Perdíveis, Bugadas) agora seguem a lista da tela; em "Todas" contam também as já conquistadas, e atualizam quando as etiquetas chegam.
- Mapas consistentes: um site que só falhou na hora (rede, anti-robô) mantém o mapa já achado, e resultado incompleto não fica guardado.
- Arquivos e estilos sem uso foram removidos; mais de 40 novos testes automáticos.

## Novidades da versão 0.7.36

- O menu de Mapas interativos não fica mais cortado pela barra de pesquisa.
- Salvar alterações agora acende também ao trocar o tema de cores e ao mudar as listas de Aparência; o tema só é gravado ao salvar (e Descartar volta ao anterior).

## Novidades da versão 0.7.35

- Só DLCs de verdade viram caixa: origens com menos de 3 conquistas (updates gratuitos, episódios e missões avulsas) ficam no jogo base.
- Os nomes das DLCs aparecem sem a palavra "DLC" na frente.
- Sites bloqueados de fábrica não se repetem mais na sua lista nem no aviso de bloqueio automático.
- O botão de recolher a barra de pesquisa não fica mais verde.

## Novidades da versão 0.7.34

- Resumo do guia e barra de pesquisa iguais quando recolhidos: mesma altura, mesmo título e mesmo botão "mostrar".
- O botão "Exportar o que falta" agora se chama só Exportar.

## Novidades da versão 0.7.33

- Caixas de confirmação no visual do programa (alterações não salvas, restaurar padrão), com os botões Continuar editando / Descartar / Salvar e sair. Esc fecha.
- Reiniciar busca corrigido: agora zera a barra e refaz tudo na ordem (DLCs, guias, etiquetas). Antes só refazia os guias e deixava a busca de DLC antiga mexendo na barra, o que mostrava etapas puladas ou prontas fora de hora.

## Novidades da versão 0.7.32

- Menu de Configurações realmente fixo: ele pulava ~40 px ao rolar a página (a posição de rolagem era diferente da posição normal). Agora fica no mesmo lugar sempre, e cada aba abre no topo.
- Aba Novidades sem "pulo": o histórico é carregado antes e a aba já abre pronta, em vez de trocar o texto depois de aparecer.
- Sites bloqueados de fábrica: SteamHunters e PSNProfiles entraram na lista (pedem verificação anti-robô). A pesquisa de DLC também respeita a lista de bloqueados.
- Palavra "null" solta na aba Cache (e onde mais pudesse aparecer): corrigida em todo o programa.
- Testar conexões: Exophase, PowerPyx e Bing agora são testados pelo mesmo caminho que o programa usa de verdade (janela de navegador escondida), então não dão mais erro 403 falso.

## Novidades da versão 0.7.31

- Qualquer jogo pode ser pesquisado: jogos que não estão na sua biblioteca não dão mais o aviso "Ops, perfil precisa estar público". Eles abrem com a lista de conquistas, os guias, o tempo e as DLCs, só sem o seu progresso.

## Novidades da versão 0.7.30

- Sumário das Configurações sempre no mesmo lugar: a barra de rolagem ocupa sempre o mesmo espaço, então o menu lateral não se move mais ao trocar de aba.

## Novidades da versão 0.7.29

- Guias que só mostram a raridade do troféu ("Prata", "Gold", "Ultra Rare"...) agora são ignorados. Se havia um desses guardado, a conquista é pesquisada de novo em outros sites.
- O limite de guias de reserva por conquista subiu de 2 para 8.

## Novidades da versão 0.7.28

- Barra de pesquisa compacta: uma linha com as 5 etapas lado a lado (ficam verdes ao concluir), uma barra fina e uma linha de status. O botão recolher também fica verde quando tudo termina.
- Tela mais limpa: o texto longo sob o filtro de origem saiu; os detalhes aparecem ao passar o mouse em "Organizar DLCs".
- Correção na pesquisa de DLC: páginas do próprio buscador (imagens, vídeos) não são mais abertas e não gastam mais o limite de páginas.

## Novidades da versão 0.7.27

- Barra de pesquisa em etapas (conquistas, tempo, DLCs, guias, etiquetas), com botão de recolher e opção para começar recolhida.
- Listas de troféus da PlayStation como busca secundária para jogo base/DLC.

## Novidades da versão 0.7.26

- Ordem da busca: conquistas, tempo, caixas jogo base/DLC, guias e etiquetas.
- Separação por pesquisa na internet (um voto por site) além do Exophase e dos guias.
- Sem limite de guias por conquista.

## Novidades da versão 0.7.25

- Configurações: Salvar alterações / Descartar / Restaurar padrão.
- Etiquetas por pontuação com todos os guias (várias por conquista).
- Botão "Mods (Nexus)" no cabeçalho do jogo.
- Busca de guias mais precisa (palavra inteira) e variações de nome mais curtas.

## Novidades da versão 0.7.24

- Separação jogo base / DLC por votação entre Exophase, guias e texto da conquista (a etiqueta mostra os votos).
- "Resumo do guia de conquistas já aberto" (antes "Resumo para platinar").

## Novidades da versão 0.7.23

- Abas novas em Configurações: **Rádio** e **Ferramentas** (testar conexões, relatório de diagnóstico).
- Guias: idioma (pt/en/os dois), ordem das fontes, palavras a ignorar nos nomes, Exophase ligado/desligado.
- Dados: exportar/importar, pasta à escolha, lixeira de anotações (30 dias), exportar o que falta em PDF/texto.
- Cache: duração, limite de espaço, apagar ao fechar, "sempre buscar de novo" por tipo.
- Conta Steam: esconder demos e ferramentas na busca.

## Novidades da versão 0.7.22

- Configurações > **Aparência e uso**: tamanho da letra, densidade da lista, ícones coloridos, tela inicial, filtro padrão, resumo aberto e caixas por DLC.
- Barra de categoria à direita; barra de origem (jogo base/DLC) à esquerda.

## Novidades da versão 0.7.21

- Opção **Não salvar cache**; trilhas sonoras nunca contam como DLC com conquistas.

## Novidades da versão 0.7.20

- Buscas ignoram Remastered/Remake/Ultimate Edition etc.; Season Pass fora dos filtros de DLC; player da rádio na altura da busca; corrigido "null" na linha de guias.

## Novidades da versão 0.7.19

- **Divisão de DLCs mais confiável**, com motivo explicado quando falha; DLCs com "Steam Achievements" na loja são tratadas como jogáveis; passes não viram origem.

## Novidades da versão 0.7.18

- **Divisão automática de DLCs** pelo Exophase; **DLCs só de itens/trilha** são ignoradas.
- **Player da rádio** maior, ícones centralizados e nome da música com rolagem.

## Novidades da versão 0.7.17

- **Caixas separadas** para jogo base e cada DLC, **filtros por origem** e modo **🗂 Organizar DLCs** (marcar várias conquistas, Shift para intervalo, mover de uma vez; fica salvo).
- Guias cujo título traz o nome da DLC classificam a conquista automaticamente.

## Novidades da versão 0.7.16

- **Datas das fontes corrigidas** (ludo.guide, pandallax.com).

## Novidades da versão 0.7.15

- **Rádio GameFM:** mini player na barra de cima (▶/⏸, volume, música atual) com o stream público de gamefm.com.br.

## Novidades da versão 0.7.14

- **Jogo base x DLCs:** a lista é separada em blocos (Jogo base / DLC · nome) com contagem e progresso, mais uma barra "Origem" para filtrar. Detecção por nomes de DLC da loja, seções dos guias e texto da conquista; correção manual pelo lápis ✎ (seção "Origem").

## Novidades da versão 0.7.13

- **Links de mídia mais simples:** "IMAGEM 1", "VÍDEO 1"…
- **Anotações:** só o status "Salvo", sem texto explicativo.
- **Data da fonte:** leitura de data reconhece mais formatos de página.

## Novidades da versão 0.7.12

- **Anotações em cada conquista:** abra uma conquista e escreva o que quiser lembrar. Salva sozinho e fica guardado em "meus dados" (limpar o cache não apaga). Conquistas com anotação ganham um 📝.
- **Cache dobrado:** jogos com anotações suas ficam no cache pelo dobro do tempo, e a aba Cache mostra quais são.

## Novidades da versão 0.7.11

- **Fechar o programa agora encerra tudo:** antes, as janelas escondidas usadas nas buscas mantinham o Electron rodando em segundo plano. Agora elas são fechadas junto com a janela principal.

## Novidades da versão 0.7.10

- O cabeçalho do jogo agora tem **um único botão de mapas**: com um site abre direto; com vários mostra "🗺 Mapas interativos (N) ▾" e abre uma janelinha com o nome de cada um (fecha ao clicar fora ou com Esc).

## Novidades da versão 0.7.9

- **10 guias principais:** além do PowerPyx e dos quatro sites que já existiam (IGN Wiki, GameFAQs, Fextralife, Game8), entram **Gamepressure, StrategyWiki, Pro Game Guides, Game Rant e Fandom Wiki**. Todos podem ser ligados ou desligados em Guias principais. A busca nos preferidos agrupa até 5 sites por pesquisa.
- **4 sites de mapas:** MapGenie, IGN Maps, Fextralife Mapa e Gamepressure Mapas, cada um com liga/desliga em Mapas principais. O botão de mapa aparece para cada site que tiver mapa do jogo.
- Novo item **{junto}** nos modelos de endereço (nome sem hífens, como `eldenring`), útil para wikis.

## Novidades da versão 0.7.8

- Nova aba **Mapas principais** em Configurações: liga/desliga o MapGenie e permite adicionar outros sites de mapas (modelo de endereço com {slug}, igual aos guias). Cada site que tiver mapa para o jogo ganha um botão 🗺 no cabeçalho.
- **Jogos 100% concluídos** agora também consultam os sites preferidos e as suas fontes próprias, para mostrar mais de um guia por conquista (antes a busca parava no PowerPyx).

## Novidades da versão 0.7.7

- Conquistas já obtidas também mostram as outras opções de guia.
- Nova aba **Novidades** em Configurações (histórico de versões).

## Novidades da versão 0.7.6

- Na tela de entrada, o link da chave virou o botão **↗ Obter minha chave (gratuita)**, igual ao do perfil, com as instruções ao lado.

## Novidades da versão 0.7.5

- **Tela de entrada renovada:** logo e nome maiores, com a versão ao lado; o cartão cresce de acordo com o tamanho do monitor (letras, campos e botões acompanham).
- Novo botão **↗ Abrir meu perfil na Steam**, que abre o seu perfil no navegador (se você estiver logado na Steam) para copiar o endereço e colar no programa.

## Novidades da versão 0.7.4

- O resumo agora se chama **Resumo: Guia de conquistas** e tem formatação nova: itens curtos (dificuldade, tempo, conquistas online...) em cartões, e os textos longos (perdíveis, jogadas mínimas, ponto sem volta...) em blocos com título, mais a introdução do guia.
- **Links de mapa clicáveis nos guias:** onde o guia traz "[Map Link]" (Fextralife e outros), aparece um botão **🗺** que abre o mapa.
- **🗺 Mapa interativo** no cabeçalho: aparece só quando o jogo tem mapa no MapGenie (conferido ao abrir o jogo e guardado por 30 dias).

## Novidades da versão 0.7.3

- **Busca mais rápida e sem repetição:** (1) uma única pesquisa para todos os sites preferidos (IGN, GameFAQs, Fextralife, Game8), em vez de uma para cada; só repete para o site que ficou de fora. (2) As páginas desses sites e as suas fontes próprias são lidas primeiro, e as pesquisas gerais e por conquista só acontecem se ainda faltar alguma explicação (antes eram todas feitas antes de ler qualquer página). (3) Nenhuma página é aberta duas vezes. (4) A lista de sites consultados mostra cada site uma vez só.

## Novidades da versão 0.7.2

- Reconhecimento de resumo mais rigoroso: o programa só aceita um resumo se a página tiver pelo menos 2 itens de quadro (dificuldade, tempo, jogadas, perdíveis...) ou uma introdução em frases de verdade. Menus, rodapés e avisos de privacidade (como o do IGN) são descartados. Resumos salvos pela regra antiga são refeitos.

## Novidades da versão 0.7.1

- O resumo para platinar agora faz parte da mesma busca das conquistas: se o guia principal não tiver resumo, a pesquisa na internet também procura páginas de "como platinar" (a barra de progresso mostra isso), e **Reiniciar busca** refaz o resumo junto com as conquistas.

## Novidades da versão 0.7.0

- **Resumo: como platinar este jogo**, entre o cabeçalho e as conquistas. Começa recolhido (botão para abrir). Mostra dificuldade, tempo estimado, perdíveis, quantas jogadas são necessárias, ponto sem volta etc., mais a introdução do guia, traduzidos para o português (com "Ver original"). Se mais de um guia tiver resumo, aparecem botões para escolher qual ler.
- Botão **👥 Central da comunidade**: agora abre a central da comunidade Steam do jogo (e não só os guias).
- Removido o "- 50 - Ouro" (pontos e tipo do troféu) dos textos dos guias.
- **Firewall:** desligamos no programa a descoberta de dispositivos (Cast/mDNS) e o WebRTC, que faziam o Windows perguntar sobre o firewall. O programa só se conecta à internet, não abre portas para receber conexões.

## Novidades da versão 0.6.9

- **Conquistas ocultas agora mostram a descrição.** A Web API da Steam devolve essas conquistas sem descrição; o programa passa a ler a página pública de conquistas da comunidade Steam (que mostra tudo) e preenche o texto em português e em inglês. Isso também melhora a busca por guias dessas conquistas. (Conferido com o Dragon's Dogma 2: as 7 ocultas aparecem com descrição.)
- Novo botão **👥 Guias da comunidade** no cabeçalho, que abre os guias da comunidade Steam do jogo.

## Novidades da versão 0.6.8

- O botão **↻ Reiniciar busca** foi para o cabeçalho, junto de "Página na loja" e "Conquistas na Steam".
- Quando os guias vêm do cache, a barra avisa isso (antes aparecia "null").

## Novidades da versão 0.6.7

- Barra de busca reorganizada (título e etapas no topo, barra em largura total, texto e sites embaixo). O botão **↻ Reiniciar busca** fica sempre visível, inclusive depois que a busca termina, e recomeça sem usar guias já salvos.
- Busca mais rápida: o programa deixa uma janela interna pronta ao abrir e reaproveita-a entre páginas (antes abria uma nova a cada página, o que parecia travar no PowerPyx).

## Novidades da versão 0.6.6

- Removido o botão duplicado de limpar dados (use a aba Cache).
- Barra de busca: a barra de progresso vai até o fim, o texto fica embaixo e o botão de reiniciar no canto.
- O nome do jogo vem da sua biblioteca/loja (corrige nomes internos como "Charm").
- Busca de jogos melhor: ignora apóstrofos e pontuação, tenta variações do texto e mostra mais resultados.

## Novidades da versão 0.6.5

- **Reiniciar busca:** a barra "Pesquisando" tem o botão **↻ Reiniciar busca**, que cancela a busca em andamento (mesmo travada) e recomeça no mesmo jogo.
- **Nova aba Cache** em Configurações: mostra os jogos e guias guardados (com tamanho e data), e permite apagar por jogo, só as traduções, guias e traduções, ou tudo. Suas correções (✎) e configurações nunca são apagadas.

## Novidades da versão 0.6.4

- **Novo cabeçalho do jogo (opção C):** fundo desfocado com a capa, capa pequena na proporção certa (sem esticar) e a pesquisa de guias numa faixa fina no pé do cartão.
- **Botão "← Voltar ao jogo"** no sumário das Configurações (abaixo da versão).
- **Correção:** ao sair das Configurações, o programa volta para o jogo que você estava vendo (o pesquisado), e não para o último jogo jogado. Nada é recarregado.

## Novidades da versão 0.6.3

- **Barra de pesquisa dos guias:** no cabeçalho do jogo aparece um painel "Procurando guias" com as etapas (Guias principais -> Sites preferidos -> Pesquisa na internet), uma barra de progresso, o site que está sendo consultado agora, "X de Y" e a lista dos sites já consultados. No fim mostra "Pesquisa concluída" por alguns segundos.

## Novidades da versão 0.6.2

- **Bloqueio automático:** se um site (de qualquer fonte, inclusive as que você adicionou) pedir verificação anti-robô, ele vai sozinho para Sites bloqueados (marcado "automático"), a sua fonte própria é desligada e aparece um aviso amarelo explicando isso no cabeçalho do jogo e em Configurações.
- **Configurações em abas:** só a seção escolhida no sumário aparece. "Guias principais" reúne PowerPyx, sites preferidos e as suas fontes numa lista só.
- Explicação de "Adicionar um guia" refeita em 4 passos, com um jogo genérico ("Jogo Exemplo").

## Novidades da versão 0.6.1

- **Mais fontes por padrão:** além do PowerPyx, o programa consulta primeiro IGN Wiki, GameFAQs, Fextralife Wiki e Game8 (cada um pode ser desligado em Configurações) e só depois procura por conta própria. Textos que apenas repetem a descrição da Steam são descartados.
- **XboxAchievements e PlayStationTrophies** passaram para a lista de bloqueados de fábrica: pedem verificação anti-robô (Cloudflare) e só faziam perder tempo.
- **Configurações reorganizadas:** sumário fixo à esquerda (Aparência, Fontes de guias, Sites bloqueados, Tradução e dados, Conta Steam), seções separadas, mensagens perto do botão que as causou e textos reescritos. A lista de bloqueados agora explica o motivo de cada grupo.

## Novidades da versão 0.6.0 (E6: Configurações)

- **Configurações > Fontes de guias:** ligar/desligar o PowerPyx e a busca na web; **adicionar suas próprias fontes** (endereço com `{slug}`, `{nome}` ou `{id}`) e excluí-las; lista de **sites bloqueados** editável; status de cada fonte ("funcionou em…") e lista de sites que já funcionaram.
- Opção de ligar/desligar a tradução automática e botão **Limpar guias e traduções salvos** (suas correções com o lápis ficam).
- O diagnóstico ("ver diagnóstico") agora também mostra a busca em outras fontes.
- O leitor de páginas entende também listas no formato "Nome – como conseguir" e tabelas Conquista/Requisito (testado no GTA IV).
- **Instalador:** dê dois cliques em `Gerar-instalador.bat` (precisa do Node.js e de internet) para criar um instalador do Windows na pasta `dist-instalador`. `Gerar-exe.bat` continua gerando a versão em pasta, sem instalação.

## Novidades da versão 0.5.4

- Variações do nome também com siglas e números ("Grand Theft Auto IV" -> "GTA 4") e sem "The Complete Edition".
- Enquanto busca em outras fontes, o status diz isso em vez de "nenhuma fonte encontrou".

## Novidades da versão 0.5.3

- Guias de jogos com nome longo (ex.: "The Elder Scrolls V: Skyrim Special Edition"): o programa agora tenta variações do nome (sem "Special Edition", sem "The", só "Skyrim") no PowerPyx e nas buscas.
- Jogos que a Steam entrega com nome interno ("ValveTestApp72850") passam a usar o nome verdadeiro da loja.

## Novidades da versão 0.5.2

- Dois botões no cabeçalho do jogo: **Página na loja** e **Conquistas na Steam** (a sua página de conquistas daquele jogo).
- Some o aviso "jogo parecido" ao lado do HowLongToBeat.

## Novidades da versão 0.5.1

- Capa do jogo: jogos novos (como Control Resonant) usam outro endereço de imagem na Steam. Agora o programa tenta os endereços novos e, se não der, pergunta à loja da Steam o endereço certo.

## Novidades da versão 0.5.0 (E5: tradução)

- Ao abrir uma conquista, o texto do guia é traduzido para o português (pelo Google Tradutor, sem chave) e fica guardado no computador por 90 dias.
- Botão **Ver original (inglês) / Ver em português** em cada guia.
- Se a tradução falhar: mensagem, **Tentar de novo** e **Copiar pedido** (copia o texto com um pedido de tradução para você colar no Claude).
- Ainda não feito: tradução offline (Argos) e resumos. O tradutor usado é um serviço não oficial e pode limitar o uso.

## Novidades da versão 0.4.2

- O guia principal (PowerPyx) agora mostra a data. Os guias salvos antes disso são refeitos uma vez.
- Datas de páginas atualizadas aparecem como "atualizado em".

## Novidades da versão 0.4.1 (e 0.4.0)

- **Várias fontes por conquista.** Para todas as conquistas que faltam (e não só as sem explicação), o programa busca outras páginas na web e extrai a explicação dali (útil para as conquistas de DLC, que guias antigos não têm).
- **Botão para trocar de fonte**, com a data de cada guia ("PowerPyx (27/03/2024)"). Abre por padrão o guia principal quando ele explica a conquista; senão, a fonte mais recente com explicação completa. Máximo de 3 fontes por conquista.
- Links que aparecem sozinhos no guia (como "All Grilled Meat Locations") viram botões 🔗.
- Sites com verificação anti-robô (TrueAchievements, TrueSteamAchievements, Gamerguides), Reddit e YouTube ficam de fora da busca.
- A busca extra é guardada por 30 dias (3 dias quando nada foi achado).

## Novidades da versão 0.3.2

- **Guia completo, sem cortes:** o programa lê a tabela do guia do PowerPyx, ignora a explicação curta (que repete a da Steam) e mostra a explicação completa numa **caixa com rolagem**. Se a conquista só tem a explicação curta, usa ela.
- **Imagens e vídeos do guia** viram links numerados ("IMAGEM DO GUIA 1", "VÍDEO DO GUIA 1").
- **Dicas, notas e avisos** do guia aparecem destacados (verde, azul e amarelo).
- Quando o guia manda "Refer to X", mostra também o passo a passo de X.
- Os 3 vídeos recomendados foram descartados: ficam os botões "Buscar guia no Google" e "Buscar vídeos no YouTube".

## Versão 0.3.1

- As janelas escondidas que leem os guias agora bloqueiam propagandas e rastreadores (eram a fonte das mensagens de erro SSL no terminal) e esperam sites com verificação "Just a moment".
- Se nenhum guia for encontrado, "ver diagnóstico" mostra o que foi tentado.

## Versão 0.3.0 (Etapa 3)

- **Guias da internet:** ao abrir um jogo, o programa procura o guia de troféus/conquistas no **PowerPyx** e, ao clicar numa conquista, mostra os trechos que falam dela, com o nome da fonte (hiperlink).
- **Classificação pelos guias:** a Steam (nome/descrição) vem primeiro; se ela não decidir, vale o que o guia indica (perdível, bugada, final, dificuldade) e a conquista ganha o selo "pelo guia". Quando as fontes discordam aparece "Fontes divergem" e você decide com o lápis ✎. Sua correção sempre vale mais.
- Guias ficam guardados por 30 dias. Só aparece o que o PowerPyx cobre; jogos sem guia ali mostram "nenhuma fonte encontrou este jogo".
- Os trechos ainda estão em inglês (tradução na Etapa 5).
- Links do tempo (HowLongToBeat) agora no nome da fonte.

## Versão 0.2.1

- Removida a opção de digitar o tempo à mão (as fontes serão editáveis em Configurações, nas próximas etapas).
- A versão agora aparece embaixo do nome, no topo.

## Versão 0.2.0 (Etapa 2)

- **Tempo para zerar** (história e 100%) no cabeçalho, buscado no HowLongToBeat.
- **Destaques** de finais e de conquistas ligadas à dificuldade que ainda faltam.
- **Filtros por categoria** (Finais, Dificuldade, Perdíveis, Bugadas), cada um com borda de cor diferente.
- **Lápis ✎** em cada conquista para reclassificar; fica salvo em `Documentos\BuscaConquistaCache\meus-dados` (apagar a pasta `cache` não perde as suas correções).
- A classificação automática usa só nome e descrição da Steam; os guias da internet entram na Etapa 3.

## Versão 0.1.5

- Corrigido de verdade o endereço dos ícones novos (uma função antiga duplicada anulava a correção das versões 0.1.2 a 0.1.4).

## Versão 0.1.4

- Se um ícone não carrega na página, o programa o baixa por conta própria; se ainda assim falhar, a conquista mostra (ao clicar) os endereços tentados e as respostas.

## Versão 0.1.3

- O número da versão aparece ao lado do nome, no topo (para conferir se você está abrindo a versão nova).

## Versão 0.1.2

- **Barra de busca no centro**, maior, e a **logo** ao lado do nome do programa.
- **Ícones das conquistas de DLC** (e de qualquer conquista nova): a Steam não serve mais as imagens novas no endereço antigo (dava erro 404); o programa agora usa o endereço atual `community_assets` e só depois o antigo e o escudo.

## Versão 0.1.1

- **Temas de cores** em Configurações → Aparência: Tema Padrão, Verão, Meia-Noite, Aço, Cósmico e Modo Escuro. A escolha fica salva.
- **Foto e nome** no canto superior direito abrem o seu perfil na Steam.
- **Ícones de conquista** que não carregam agora têm plano B (versão escurecida ou um escudo), sem quadradinho quebrado.
- **Ícone do programa** novo (troféu com lupa), na janela e no `.exe`. Para usar outro, troque `assets\icon.ico` e `assets\icon.png` (o `.ico` precisa ter vários tamanhos, de 16 a 256) antes de rodar `Gerar-exe.bat`.

## Como abrir

Instale o **Node.js (versão LTS)** em https://nodejs.org, descompacte esta pasta e use um destes:

- **`Executar.bat`** (dois cliques): instala o necessário na primeira vez (precisa de internet) e abre o programa.
- **`Gerar-exe.bat`**: cria `dist\BuscaConquista-win32-x64\BuscaConquista.exe`, um programa que abre sem o Node.js e que você pode copiar para onde quiser.

## Como usar

1. Abra o programa.
2. Na primeira vez, informe:
   - **Seu perfil Steam:** link do perfil, apelido ou SteamID de 17 dígitos.
   - **Chave da Steam Web API:** gratuita, em https://steamcommunity.com/dev/apikey (no campo "domínio" pode escrever `localhost`).
3. **Seu perfil e os detalhes dos jogos precisam estar com visibilidade Pública** (Steam → Perfil → Editar perfil → Configurações de privacidade).

Se gerar o `.exe`, o Windows pode mostrar um aviso azul ("O Windows protegeu o computador") porque o programa não é assinado digitalmente.
Clique em "Mais informações" → "Executar assim mesmo".

## Onde ficam os dados

`Documentos\BuscaConquistaCache\`
- `config.json` — seu perfil e a chave da API (a chave é criptografada com a sua conta do Windows).
- `cache\` — nomes, ícones e porcentagens (porcentagens atualizam a cada 24 h; nomes/ícones a cada 7 dias; biblioteca a cada 5 min).

Para limpar o cache, apague a pasta `cache`. Para sair da conta, apague `config.json`.

## Para quem quiser rodar pelo código

```
npm install
npm start          # abre o programa
npm test           # testes automáticos (usam uma Steam simulada)
npm run package:win  # gera dist\BuscaConquista-win32-x64
```

## Roteiro

- E1: login, último jogo, busca, lista de conquistas, filtro Todas / Não alcançadas.
- E2: tempo, destaques, filtros por categoria, lápis para reclassificar.
- E3 (esta): guias da internet (PowerPyx) e classificação pelos guias.
- E4: descartada (os botões de busca no YouTube já resolvem).
- E5: tradução e resumos.
- E6: configurações de fontes e instalador.
