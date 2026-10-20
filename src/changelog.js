'use strict';

/** Histórico de versões (aparece em Configurações > Novidades). **negrito** marca destaques. */
module.exports = [
  {
    "version": "0.8.0",
    "items": [
      "**Atualização automática:** o programa procura versões novas nas Releases do GitHub (ao abrir e a cada 6 horas), baixa só o código (cerca de 0,5 MB) e avisa para reiniciar. Se uma atualização travar ao abrir, volta sozinho para a versão instalada.",
      "Nova aba **Configurações > Atualizações**: botão para procurar agora, opção de desligar a busca automática e escolha entre receber versões beta (testes) ou só estáveis.",
      "Esta é a primeira versão **beta** (pré-lançamento) aberta aos testadores."
    ]
  },
  {
    "version": "0.7.37",
    "items": [
      "**Revisão geral do código:** corrigidas lentidões em páginas enormes (tempo do HowLongToBeat, títulos de DLC e etiquetas), gravação de cache e perfil mais segura contra quedas, e importação de dados mais rígida.",
      "Ao abrir outro jogo, a busca do anterior para na hora e não disputa a internet com a nova.",
      "**Barra de categorias com várias cores:** a faixa à direita da conquista mostra uma cor para cada etiqueta (final, perdível, dificuldade, bugada).",
      "**Nome da DLC sem o nome do jogo** (\"Legacy of the First Blade\", e não \"Assassin's Creed Odyssey – Legacy of the First Blade\").",
      "**Mapa de outro jogo:** agora só vale o mapa cujo endereço ou título cita o jogo (acabou o caso de \"Titan Quest 2\" aparecer no Binding of Isaac); mapas já guardados são conferidos de novo.",
      "**Mapas mais completos:** o Gamepressure agora é procurado de até 3 formas (o Bing varia), um mapa já achado não some, e lista incompleta é refeita depois de 1 dia. O diagnóstico mostra o resultado de cada site de mapa.",
      "Sites que pedem verificação anti-robô e agora vêm bloqueados de fábrica: trophieshunter.com, keengamer.com e ludo.guide.",
      "A linha final da busca mostra **quanto tempo a pesquisa levou** (ex.: \"pesquisa levou 42 s\").",
      "**Nova etapa \"Mapas\"** na barra de pesquisa (a busca de mapas interativos já acontecia, mas sem aparecer), e \"Base e DLCs\" passou a se chamar só **DLCs**.",
      "**Barra de pesquisa mais limpa:** ao terminar, sem a barra verde, sem número de conquistas e sem horas; mostra só o resultado (DLCs, sites consultados, etiquetas) em texto que quebra linha e não fica cortado; recolhida, mostra a mesma coisa em versão curta, numa linha só. Removidos também os destaques \"Finais: faltam…\" do cabeçalho.",
      "**Resumo do guia dentro do cabeçalho:** agora fica logo abaixo da barra de pesquisa, com o mesmo fundo e o mesmo visual.",
      "**Filtros de etiqueta corretos:** os números (Finais, Dificuldade, Perdíveis, Bugadas) agora seguem a lista da tela; em \"Todas\" contam também as já conquistadas, e atualizam quando as etiquetas chegam.",
      "**Mapas consistentes:** um site que só falhou na hora (rede, anti-robô) mantém o mapa já achado, e resultado incompleto não fica guardado.",
      "Arquivos e estilos sem uso foram removidos; mais de 40 novos testes automáticos."
    ]
  },
  {
    "version": "0.7.36",
    "items": [
      "O menu de **Mapas interativos** não fica mais cortado pela barra de pesquisa.",
      "**Salvar alterações** agora acende também ao trocar o tema de cores e ao mudar as listas de Aparência; o tema só é gravado ao salvar (e Descartar volta ao anterior)."
    ]
  },
  {
    "version": "0.7.35",
    "items": [
      "**Só DLCs de verdade viram caixa:** origens com menos de 3 conquistas (updates gratuitos, episódios e missões avulsas) ficam no jogo base.",
      "Os nomes das DLCs aparecem sem a palavra \"DLC\" na frente.",
      "Sites bloqueados de fábrica não se repetem mais na sua lista nem no aviso de bloqueio automático.",
      "O botão de recolher a barra de pesquisa não fica mais verde."
    ]
  },
  {
    "version": "0.7.34",
    "items": [
      "**Resumo do guia e barra de pesquisa iguais quando recolhidos:** mesma altura, mesmo título e mesmo botão \"mostrar\".",
      "O botão \"Exportar o que falta\" agora se chama só **Exportar**."
    ]
  },
  {
    "version": "0.7.33",
    "items": [
      "**Caixas de confirmação no visual do programa** (alterações não salvas, restaurar padrão), com os botões Continuar editando / Descartar / Salvar e sair. Esc fecha.",
      "**Reiniciar busca corrigido:** agora zera a barra e refaz tudo na ordem (DLCs, guias, etiquetas). Antes só refazia os guias e deixava a busca de DLC antiga mexendo na barra, o que mostrava etapas puladas ou prontas fora de hora."
    ]
  },
  {
    "version": "0.7.32",
    "items": [
      "**Menu de Configurações realmente fixo:** ele pulava ~40 px ao rolar a página (a posição de rolagem era diferente da posição normal). Agora fica no mesmo lugar sempre, e cada aba abre no topo.",
      "**Aba Novidades sem \"pulo\":** o histórico é carregado antes e a aba já abre pronta, em vez de trocar o texto depois de aparecer.",
      "**Sites bloqueados de fábrica:** SteamHunters e PSNProfiles entraram na lista (pedem verificação anti-robô). A pesquisa de DLC também respeita a lista de bloqueados.",
      "**Palavra \"null\" solta na aba Cache** (e onde mais pudesse aparecer): corrigida em todo o programa.",
      "**Testar conexões:** Exophase, PowerPyx e Bing agora são testados pelo mesmo caminho que o programa usa de verdade (janela de navegador escondida), então não dão mais erro 403 falso."
    ]
  },
  {
    "version": "0.7.31",
    "items": [
      "**Qualquer jogo pode ser pesquisado:** jogos que não estão na sua biblioteca não dão mais o aviso \"Ops, perfil precisa estar público\". Eles abrem com a lista de conquistas, os guias, o tempo e as DLCs, só sem o seu progresso."
    ]
  },
  {
    "version": "0.7.30",
    "items": [
      "**Sumário das Configurações sempre no mesmo lugar:** a barra de rolagem ocupa sempre o mesmo espaço, então o menu lateral não se move mais ao trocar de aba."
    ]
  },
  {
    "version": "0.7.29",
    "items": [
      "**Guias que só mostram a raridade do troféu** (\"Prata\", \"Gold\", \"Ultra Rare\"...) agora são ignorados. Se havia um desses guardado, a conquista é pesquisada de novo em outros sites.",
      "O limite de guias de reserva por conquista subiu de 2 para 8."
    ]
  },
  {
    "version": "0.7.28",
    "items": [
      "**Barra de pesquisa compacta:** uma linha com as 5 etapas lado a lado (ficam verdes ao concluir), uma barra fina e uma linha de status. O botão recolher também fica verde quando tudo termina.",
      "**Tela mais limpa:** o texto longo sob o filtro de origem saiu; os detalhes aparecem ao passar o mouse em \"Organizar DLCs\".",
      "**Correção na pesquisa de DLC:** páginas do próprio buscador (imagens, vídeos) não são mais abertas e não gastam mais o limite de páginas."
    ]
  },
  {
    "version": "0.7.27",
    "items": [
      "**Barra de pesquisa nova:** lista tudo o que o programa está fazendo, etapa por etapa (conquistas, tempo, jogo base e DLCs, guias, etiquetas), com o que cada uma achou e o site que está sendo consultado.",
      "Botão **recolher/mostrar** na barra e, em Configurações > Aparência, a opção **\"Barra de pesquisa começa recolhida\"**.",
      "**Listas de troféus da PlayStation** (PSNProfiles, PlayStationTrophies, TrueTrophies) como busca secundária para separar jogo base e DLC, quando a pesquisa geral não achar."
    ]
  },
  {
    "version": "0.7.26",
    "items": [
      "**Nova ordem da busca:** 1) conquistas da Steam, 2) tempo no HowLongToBeat, 3) caixas de jogo base e DLCs, 4) guias e etiquetas. As caixas deixam de esperar os guias.",
      "**Separação por pesquisa na internet:** para cada DLC jogável da loja, o programa pesquisa e lê páginas que listam conquistas por seção. Cada site que separa as conquistas vira um voto, junto com o Exophase e os guias. Nomes de DLC só vêm da loja Steam, então missões secundárias não viram caixa.",
      "**Sem limite de guias:** acabou o teto de 3 guias por conquista (e de 2 trechos por site); tudo o que for encontrado aparece.",
      "**Listas de troféus da PlayStation como busca secundária:** se a pesquisa geral não achar nenhum site que separe as conquistas, o programa consulta PSNProfiles, PlayStationTrophies e TrueTrophies (a Sony separa jogo base e DLC). Esses votos pesam mais.",
      "O relatório de diagnóstico agora registra cada busca de DLC (quais páginas foram lidas e quais separaram)."
    ]
  },
  {
    "version": "0.7.25",
    "items": [
      "**Configurações com botões:** \"Salvar alterações\", \"Descartar\" e \"Restaurar padrão\". As mudanças aparecem na hora, mas só são gravadas quando você salva (ao sair com algo pendente, o programa pergunta).",
      "**Etiquetas (final, dificuldade, perdível, bugada) por pontuação:** a Steam, a seção e o texto de cada guia pesquisado somam pontos; uma pista fraca de uma fonte só não vira etiqueta, e uma conquista pode ter mais de uma. Passe o mouse na etiqueta para ver quem indicou.",
      "**Botão \"Mods (Nexus)\"** no cabeçalho do jogo: abre a página de mods dele no Nexus Mods.",
      "**Busca de guias:** o PowerPyx só aceita o guia se o nome do jogo bater por palavras inteiras (\"Wild Hunt\" não casa mais com \"Monster Hunter Wilds\"), e as variações de nome ficaram mais enxutas (ex.: \"Skyrim\" é testado cedo)."
    ]
  },
  {
    "version": "0.7.24",
    "items": [
      "**Jogo base x DLC por votação:** além do Exophase, cada guia encontrado (PowerPyx, IGN, etc.) agora também \"vota\" pela seção ou título onde a conquista aparece, e o texto da conquista entra como pista. As fontes decidem juntas; em empate, o site de conquistas desempata. Passe o mouse na etiqueta da DLC para ver os votos e se as fontes divergem.",
      "A opção do painel passou a se chamar \"Resumo do guia de conquistas já aberto\"."
    ]
  },
  {
    "version": "0.7.23",
    "items": [
      "**Rádio (Configurações > Rádio):** tocar sozinha ao abrir, voltar a tocar se estava tocando ou nunca tocar sozinha; esconder o player; pausar ao minimizar; baixar o volume ao abrir um vídeo do YouTube.",
      "**Guias:** idioma preferido (português, inglês ou os dois), ordem de prioridade das fontes (arrastar ou setas), palavras extras a ignorar nos nomes dos jogos e opção de ligar/desligar o Exophase para a divisão de DLCs.",
      "**Seus dados:** exportar e importar tudo (anotações, correções, origens de DLC), escolher a pasta dos dados (por exemplo, no OneDrive), lixeira de anotações por 30 dias e exportar a lista do que falta, com suas anotações, em PDF ou texto (botão acima da lista).",
      "**Cache:** duração (7, 30 ou 90 dias), limite de espaço, apagar ao fechar e escolher o que nunca usa o cache (% global, biblioteca, tempo para zerar, guias, mapas, DLCs).",
      "**Ferramentas:** \"Testar conexões\" (Steam, HowLongToBeat, PowerPyx, Exophase, Bing, tradutor e rádio) e relatório de diagnóstico para me enviar; modo diagnóstico grava o registro em arquivo.",
      "**Conta Steam:** opção para esconder demos, servidores, SDKs e trilhas nas sugestões de busca."
    ]
  },
  {
    "version": "0.7.22",
    "items": [
      "**Aparência e uso (Configurações):** tamanho da letra (pequena a muito grande), densidade da lista (compacta, normal, confortável) e ícones coloridos também nas conquistas não alcançadas.",
      "**Ao abrir:** escolha se o programa inicia no último jogo ou na tela de busca, se cada jogo abre em \"Só as não alcançadas\" ou \"Todas\", se o resumo para platinar já vem aberto e se a lista é separada em caixas de jogo base/DLC.",
      "**Barras de cor:** a barra da categoria (finais, dificuldade, perdíveis, bugadas) agora fica à direita da linha; a barra da esquerda é só da origem (jogo base ou DLC)."
    ]
  },
  {
    "version": "0.7.21",
    "items": [
      "**Opção \"Não salvar cache\"** (Configurações > Cache): marcada, nada novo é guardado e tudo é buscado de novo a cada vez. O que já estava salvo continua sendo lido até você apagar; anotações e correções não são afetadas.",
      "**Trilha sonora não é DLC com conquistas:** trilhas, artbooks e similares são sempre ignorados, mesmo que a loja marque \"Steam Achievements\", e não aparecem mais como origem (ex.: \"Blood and Wine Soundtrack\" no Witcher 3)."
    ]
  },
  {
    "version": "0.7.20",
    "items": [
      "**Buscas ignoram a edição do jogo:** palavras como Remastered, Remake, Ultimate/Complete/Definitive/Deluxe/Game of the Year Edition, Director's Cut etc. são removidas do nome em todas as buscas (HowLongToBeat, guias, mapas, DLCs e os botões do Google/YouTube). O título exibido continua o original.",
      "**Season Pass fora dos filtros:** passes e pacotes não aparecem mais como origem de DLC.",
      "**Player da rádio** com a mesma altura da caixa de busca.",
      "Corrigido o \"null\" que aparecia na linha de guias quando nenhuma fonte encontrava o jogo."
    ]
  },
  {
    "version": "0.7.19",
    "items": [
      "**Divisão de DLCs mais confiável:** o resultado do site de conquistas agora é guardado separado (e uma falha só fica guardada por 1 dia, não 30). Quando não dá certo, a nota abaixo da barra de origem explica o motivo.",
      "**Steam como referência:** o programa lê na loja da Steam quais DLCs têm \"Steam Achievements\" (o dado que o SteamDB mostra) e as trata como DLCs jogáveis. O SteamDB em si bloqueia acesso automático, então não é usado.",
      "**Season Pass não vira origem:** passes e pacotes (que reúnem várias DLCs) são ignorados como nome de DLC; vale o nome de cada DLC vindo do site de conquistas."
    ]
  },
  {
    "version": "0.7.18",
    "items": [
      "**Divisão automática de DLCs:** o programa consulta o Exophase, site que já separa as conquistas por DLC, e distribui as conquistas sozinho (você só ajusta o que precisar).",
      "**DLC jogável x só itens:** cada DLC da loja Steam é julgada pelo nome, descrição e preço. Trilha sonora, artbook, skins e pacotes de itens ficam de fora das caixas e filtros (aparecem numa nota).",
      "**Player da rádio maior:** ícones ▶/⏸ centralizados, texto maior e o nome da música rola quando não cabe, ajustando-se à largura da janela."
    ]
  },
  {
    "version": "0.7.17",
    "items": [
      "**Caixas separadas para jogo base e cada DLC:** cada origem agora é uma caixa própria, com cabeçalho, contagem e progresso.",
      "**Filtros por origem:** a barra \"Origem\" mostra o jogo base e todas as DLCs da loja Steam, com a quantidade de cada uma.",
      "**Modo \"🗂 Organizar DLCs\":** marque conquistas (Shift marca um intervalo, ou \"marcar esta caixa\") e mova todas de uma vez para o jogo base ou uma DLC, inclusive digitando o nome de uma DLC nova. A escolha fica salva.",
      "**Detecção por guias de DLC:** se um guia cujo título tem o nome da DLC explica a conquista, ela vai para essa DLC automaticamente."
    ]
  },
  {
    "version": "0.7.16",
    "items": [
      "**Datas das fontes corrigidas:** fontes como ludo.guide e pandallax.com apareciam sem data. Havia um erro ao ler datas no formato do site (com milissegundos) e o formato \"Last Updated: 2/13/2025\" não era reconhecido."
    ]
  },
  {
    "version": "0.7.15",
    "items": [
      "**Rádio GameFM:** mini player na barra de cima (▶/⏸, volume e a música que está tocando). Continua tocando ao trocar de jogo ou abrir as Configurações. O 📻 abre o site gamefm.com.br. Em telas estreitas o nome da música e o volume ficam escondidos."
    ]
  },
  {
    "version": "0.7.14",
    "items": [
      "**Jogo base x DLCs:** quando o jogo tem DLCs, a lista é separada em blocos claros (\"Jogo base\", \"DLC · nome\") com contagem e progresso de cada um, e aparece uma barra \"Origem\" para filtrar. Conquistas de DLC ganham uma etiqueta dourada.",
      "**Como o programa descobre:** nomes das DLCs na loja Steam citados na conquista, títulos de seção dos guias (ex.: \"DLC Trophies\") e a palavra DLC/expansion no texto. É um palpite.",
      "**Correção manual:** no lápis ✎ da conquista há a seção \"Origem\" (Jogo base ou DLC); fica salva e vale mais que o palpite."
    ]
  },
  {
    "version": "0.7.13",
    "items": [
      "**Links de mídia mais simples:** agora aparecem só como \"IMAGEM 1\", \"VÍDEO 1\"…",
      "**Anotações:** removido o texto explicativo; fica só o status \"Salvo\".",
      "**Data da fonte:** a leitura da data das páginas reconhece mais formatos (por exemplo, sites como pandallax.com), então menos fontes ficam sem data."
    ]
  },
  {
    "version": "0.7.12",
    "items": [
      "**Anotações em cada conquista:** abra uma conquista e escreva o que quiser lembrar (onde fica, o que falta, dicas). Salva sozinho enquanto você digita e fica guardado em “meus dados”: limpar o cache não apaga. Conquistas com anotação ganham um 📝 na lista.", "**Cache dobrado:** jogos com anotações suas ficam no cache pelo dobro do tempo, e a aba Cache mostra quais são."
    ]
  },
  {
    "version": "0.7.11",
    "items": [
      "**Fechar o programa agora encerra tudo:** antes, as janelas escondidas usadas nas buscas mantinham o Electron rodando em segundo plano. Agora elas são fechadas junto com a janela principal."
    ]
  },
  {
    "version": "0.7.10",
    "items": [
      "O cabeçalho do jogo agora tem **um único botão de mapas**: com um site abre direto; com vários mostra \"🗺 Mapas interativos (N) ▾\" e abre uma janelinha com o nome de cada um (fecha ao clicar fora ou com Esc)."
    ]
  },
  {
    "version": "0.7.9",
    "items": [
      "**10 guias principais:** além do PowerPyx e dos quatro sites que já existiam (IGN Wiki, GameFAQs, Fextralife, Game8), entram **Gamepressure, StrategyWiki, Pro Game Guides, Game Rant e Fandom Wiki**. Todos podem ser ligados ou desligados em Guias principais. A busca nos preferidos agrupa até 5 sites por pesquisa.",
      "**4 sites de mapas:** MapGenie, IGN Maps, Fextralife Mapa e Gamepressure Mapas, cada um com liga/desliga em Mapas principais. O botão de mapa aparece para cada site que tiver mapa do jogo.",
      "Novo item **{junto}** nos modelos de endereço (nome sem hífens, como `eldenring`), útil para wikis."
    ]
  },
  {
    "version": "0.7.8",
    "items": [
      "Nova aba **Mapas principais** em Configurações: liga/desliga o MapGenie e permite adicionar outros sites de mapas (modelo de endereço com {slug}, igual aos guias). Cada site que tiver mapa para o jogo ganha um botão 🗺 no cabeçalho.",
      "**Jogos 100% concluídos** agora também consultam os sites preferidos e as suas fontes próprias, para mostrar mais de um guia por conquista (antes a busca parava no PowerPyx)."
    ]
  },
  {
    "version": "0.7.7",
    "items": [
      "Conquistas já obtidas também mostram as outras opções de guia (antes só as que faltavam recebiam guias de outros sites). Isso não deixa a busca mais lenta: o programa só continua procurando por causa das conquistas que faltam.",
      "Nova aba **Novidades** em Configurações, com tudo o que mudou na versão atual e o histórico das anteriores."
    ]
  },
  {
    "version": "0.7.6",
    "items": [
      "Na tela de entrada, o link da chave virou o botão **↗ Obter minha chave (gratuita)**, igual ao do perfil, com as instruções ao lado."
    ]
  },
  {
    "version": "0.7.5",
    "items": [
      "**Tela de entrada renovada:** logo e nome maiores, com a versão ao lado; o cartão cresce de acordo com o tamanho do monitor (letras, campos e botões acompanham).",
      "Novo botão **↗ Abrir meu perfil na Steam**, que abre o seu perfil no navegador (se você estiver logado na Steam) para copiar o endereço e colar no programa."
    ]
  },
  {
    "version": "0.7.4",
    "items": [
      "O resumo agora se chama **Resumo: Guia de conquistas** e tem formatação nova: itens curtos (dificuldade, tempo, conquistas online...) em cartões, e os textos longos (perdíveis, jogadas mínimas, ponto sem volta...) em blocos com título, mais a introdução do guia.",
      "**Links de mapa clicáveis nos guias:** onde o guia traz \"[Map Link]\" (Fextralife e outros), aparece um botão **🗺** que abre o mapa.",
      "**🗺 Mapa interativo** no cabeçalho: aparece só quando o jogo tem mapa no MapGenie (conferido ao abrir o jogo e guardado por 30 dias)."
    ]
  },
  {
    "version": "0.7.3",
    "items": [
      "**Busca mais rápida e sem repetição:** (1) uma única pesquisa para todos os sites preferidos (IGN, GameFAQs, Fextralife, Game8), em vez de uma para cada; só repete para o site que ficou de fora. (2) As páginas desses sites e as suas fontes próprias são lidas primeiro, e as pesquisas gerais e por conquista só acontecem se ainda faltar alguma explicação (antes eram todas feitas antes de ler qualquer página). (3) Nenhuma página é aberta duas vezes. (4) A lista de sites consultados mostra cada site uma vez só."
    ]
  },
  {
    "version": "0.7.2",
    "items": [
      "Reconhecimento de resumo mais rigoroso: o programa só aceita um resumo se a página tiver pelo menos 2 itens de quadro (dificuldade, tempo, jogadas, perdíveis...) ou uma introdução em frases de verdade. Menus, rodapés e avisos de privacidade (como o do IGN) são descartados. Resumos salvos pela regra antiga são refeitos."
    ]
  },
  {
    "version": "0.7.1",
    "items": [
      "O resumo para platinar agora faz parte da mesma busca das conquistas: se o guia principal não tiver resumo, a pesquisa na internet também procura páginas de \"como platinar\" (a barra de progresso mostra isso), e **Reiniciar busca** refaz o resumo junto com as conquistas."
    ]
  },
  {
    "version": "0.7.0",
    "items": [
      "**Resumo: como platinar este jogo**, entre o cabeçalho e as conquistas. Começa recolhido (botão para abrir). Mostra dificuldade, tempo estimado, perdíveis, quantas jogadas são necessárias, ponto sem volta etc., mais a introdução do guia, traduzidos para o português (com \"Ver original\"). Se mais de um guia tiver resumo, aparecem botões para escolher qual ler.",
      "Botão **👥 Central da comunidade**: agora abre a central da comunidade Steam do jogo (e não só os guias).",
      "Removido o \"- 50 - Ouro\" (pontos e tipo do troféu) dos textos dos guias.",
      "**Firewall:** desligamos no programa a descoberta de dispositivos (Cast/mDNS) e o WebRTC, que faziam o Windows perguntar sobre o firewall. O programa só se conecta à internet, não abre portas para receber conexões."
    ]
  },
  {
    "version": "0.6.9",
    "items": [
      "**Conquistas ocultas agora mostram a descrição.** A Web API da Steam devolve essas conquistas sem descrição; o programa passa a ler a página pública de conquistas da comunidade Steam (que mostra tudo) e preenche o texto em português e em inglês. Isso também melhora a busca por guias dessas conquistas. (Conferido com o Dragon's Dogma 2: as 7 ocultas aparecem com descrição.)",
      "Novo botão **👥 Guias da comunidade** no cabeçalho, que abre os guias da comunidade Steam do jogo."
    ]
  },
  {
    "version": "0.6.8",
    "items": [
      "O botão **↻ Reiniciar busca** foi para o cabeçalho, junto de \"Página na loja\" e \"Conquistas na Steam\".",
      "Quando os guias vêm do cache, a barra avisa isso (antes aparecia \"null\")."
    ]
  },
  {
    "version": "0.6.7",
    "items": [
      "Barra de busca reorganizada (título e etapas no topo, barra em largura total, texto e sites embaixo). O botão **↻ Reiniciar busca** fica sempre visível, inclusive depois que a busca termina, e recomeça sem usar guias já salvos.",
      "Busca mais rápida: o programa deixa uma janela interna pronta ao abrir e reaproveita-a entre páginas (antes abria uma nova a cada página, o que parecia travar no PowerPyx)."
    ]
  },
  {
    "version": "0.6.6",
    "items": [
      "Removido o botão duplicado de limpar dados (use a aba Cache).",
      "Barra de busca: a barra de progresso vai até o fim, o texto fica embaixo e o botão de reiniciar no canto.",
      "O nome do jogo vem da sua biblioteca/loja (corrige nomes internos como \"Charm\").",
      "Busca de jogos melhor: ignora apóstrofos e pontuação, tenta variações do texto e mostra mais resultados."
    ]
  },
  {
    "version": "0.6.5",
    "items": [
      "**Reiniciar busca:** a barra \"Pesquisando\" tem o botão **↻ Reiniciar busca**, que cancela a busca em andamento (mesmo travada) e recomeça no mesmo jogo.",
      "**Nova aba Cache** em Configurações: mostra os jogos e guias guardados (com tamanho e data), e permite apagar por jogo, só as traduções, guias e traduções, ou tudo. Suas correções (✎) e configurações nunca são apagadas."
    ]
  },
  {
    "version": "0.6.4",
    "items": [
      "**Novo cabeçalho do jogo (opção C):** fundo desfocado com a capa, capa pequena na proporção certa (sem esticar) e a pesquisa de guias numa faixa fina no pé do cartão.",
      "**Botão \"← Voltar ao jogo\"** no sumário das Configurações (abaixo da versão).",
      "**Correção:** ao sair das Configurações, o programa volta para o jogo que você estava vendo (o pesquisado), e não para o último jogo jogado. Nada é recarregado."
    ]
  },
  {
    "version": "0.6.3",
    "items": [
      "**Barra de pesquisa dos guias:** no cabeçalho do jogo aparece um painel \"Procurando guias\" com as etapas (Guias principais -> Sites preferidos -> Pesquisa na internet), uma barra de progresso, o site que está sendo consultado agora, \"X de Y\" e a lista dos sites já consultados. No fim mostra \"Pesquisa concluída\" por alguns segundos."
    ]
  },
  {
    "version": "0.6.2",
    "items": [
      "**Bloqueio automático:** se um site (de qualquer fonte, inclusive as que você adicionou) pedir verificação anti-robô, ele vai sozinho para Sites bloqueados (marcado \"automático\"), a sua fonte própria é desligada e aparece um aviso amarelo explicando isso no cabeçalho do jogo e em Configurações.",
      "**Configurações em abas:** só a seção escolhida no sumário aparece. \"Guias principais\" reúne PowerPyx, sites preferidos e as suas fontes numa lista só.",
      "Explicação de \"Adicionar um guia\" refeita em 4 passos, com um jogo genérico (\"Jogo Exemplo\")."
    ]
  },
  {
    "version": "0.6.1",
    "items": [
      "**Mais fontes por padrão:** além do PowerPyx, o programa consulta primeiro IGN Wiki, GameFAQs, Fextralife Wiki e Game8 (cada um pode ser desligado em Configurações) e só depois procura por conta própria. Textos que apenas repetem a descrição da Steam são descartados.",
      "**XboxAchievements e PlayStationTrophies** passaram para a lista de bloqueados de fábrica: pedem verificação anti-robô (Cloudflare) e só faziam perder tempo.",
      "**Configurações reorganizadas:** sumário fixo à esquerda (Aparência, Fontes de guias, Sites bloqueados, Tradução e dados, Conta Steam), seções separadas, mensagens perto do botão que as causou e textos reescritos. A lista de bloqueados agora explica o motivo de cada grupo."
    ]
  },
  {
    "version": "0.5.4",
    "items": [
      "Variações do nome também com siglas e números (\"Grand Theft Auto IV\" -> \"GTA 4\") e sem \"The Complete Edition\".",
      "Enquanto busca em outras fontes, o status diz isso em vez de \"nenhuma fonte encontrou\"."
    ]
  },
  {
    "version": "0.5.3",
    "items": [
      "Guias de jogos com nome longo (ex.: \"The Elder Scrolls V: Skyrim Special Edition\"): o programa agora tenta variações do nome (sem \"Special Edition\", sem \"The\", só \"Skyrim\") no PowerPyx e nas buscas.",
      "Jogos que a Steam entrega com nome interno (\"ValveTestApp72850\") passam a usar o nome verdadeiro da loja."
    ]
  },
  {
    "version": "0.5.2",
    "items": [
      "Dois botões no cabeçalho do jogo: **Página na loja** e **Conquistas na Steam** (a sua página de conquistas daquele jogo).",
      "Some o aviso \"jogo parecido\" ao lado do HowLongToBeat."
    ]
  },
  {
    "version": "0.5.1",
    "items": [
      "Capa do jogo: jogos novos (como Control Resonant) usam outro endereço de imagem na Steam. Agora o programa tenta os endereços novos e, se não der, pergunta à loja da Steam o endereço certo."
    ]
  },
  {
    "version": "0.4.2",
    "items": [
      "O guia principal (PowerPyx) agora mostra a data. Os guias salvos antes disso são refeitos uma vez.",
      "Datas de páginas atualizadas aparecem como \"atualizado em\"."
    ]
  },
  {
    "version": "0.3.2",
    "items": [
      "**Guia completo, sem cortes:** o programa lê a tabela do guia do PowerPyx, ignora a explicação curta (que repete a da Steam) e mostra a explicação completa numa **caixa com rolagem**. Se a conquista só tem a explicação curta, usa ela.",
      "**Imagens e vídeos do guia** viram links numerados (\"IMAGEM DO GUIA 1\", \"VÍDEO DO GUIA 1\").",
      "**Dicas, notas e avisos** do guia aparecem destacados (verde, azul e amarelo).",
      "Quando o guia manda \"Refer to X\", mostra também o passo a passo de X.",
      "Os 3 vídeos recomendados foram descartados: ficam os botões \"Buscar guia no Google\" e \"Buscar vídeos no YouTube\"."
    ]
  }
];
