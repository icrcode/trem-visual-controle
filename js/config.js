/**
 * config.js — configuração da versão estilizada.
 * O circuito em si (segmentos, agulhas, trem, velocidade) continua em js/circuito.js;
 * aqui ficam só os elementos do "mapa": escala, estações, vagões, malha viária, passagens de nível e trânsito.
 */
window.XP500 = window.XP500 || {};

window.XP500.configuracaoMapa = {
  /** Quantos metros vale uma unidade do desenho (usado em km/h, distâncias e previsões). */
  metrosPorUnidade: 0.5,

  /** Quantas rotas alternativas mostrar, no máximo. */
  maximoRotas: 3,

  /** Estações (marcadores clicáveis). "posicao" fica sobre a pista; "rotulo" desloca o nome. */
  estacoes: [
    { id: 'estacao-norte', nome: 'Estação Norte', posicao: { x: 1010, y: 72 }, rotulo: { dx: 0, dy: -30, ancora: 'middle' } },
    { id: 'estacao-oeste', nome: 'Estação Oeste', posicao: { x: 45, y: 320 }, rotulo: { dx: 22, dy: 5, ancora: 'start' } },
    { id: 'estacao-central', nome: 'Estação Central', posicao: { x: 550, y: 434 }, rotulo: { dx: 0, dy: -26, ancora: 'middle' } },
    { id: 'patio-ramal', nome: 'Pátio do Ramal', posicao: { x: 930, y: 591 }, rotulo: { dx: 0, dy: -24, ancora: 'middle' } },
    { id: 'estacao-leste', nome: 'Estação Leste', posicao: { x: 1590, y: 630 }, rotulo: { dx: -22, dy: 5, ancora: 'end' } },
    { id: 'terminal-sul', nome: 'Terminal Sul', posicao: { x: 520, y: 862 }, rotulo: { dx: 0, dy: 36, ancora: 'middle' } },
  ],

  /** Quantidade de vagões (a locomotiva não conta). As cores seguem a lista do trem em js/circuito.js, em ciclo. */
  vagoes: { minimo: 1, maximo: 12, inicial: 3 },

  /**
   * Malha viária. Cada rua é uma linha de pontos ligados por trechos retos;
   * pontos com as mesmas coordenadas em ruas diferentes viram esquinas.
   * A malha é fechada (sem ruas sem saída): os carros circulam o tempo todo,
   * escolhendo um caminho a cada esquina. Mão dupla, trânsito pela direita.
   * As passagens de nível são calculadas onde os trechos cruzam os trilhos.
   * Campos omitidos usam "padraoRua".
   */
  padraoRua: {
    largura: 26,
    deslocamentoFaixa: 6.5,     // distância do centro da rua até o centro de cada faixa
    velocidadeCarro: 65,        // unidades por segundo
    raioCarro: 5,
  },
  ruas: [
    { id: 'av-paddock', nome: 'Av. Paddock', largura: 50, deslocamentoFaixa: 12, velocidadeCarro: 85, raioCarro: 7,
      pontos: [[760, -10], [760, 150], [760, 300], [760, 495], [760, 650], [760, 790], [760, 940]] },
    { id: 'r-monza', nome: 'R. Monza', pontos: [[-40, -10], [300, -10], [760, -10], [1700, -10]] },
    { id: 'r-spa', nome: 'R. Spa', pontos: [[1700, -10], [1700, 300], [1700, 790], [1700, 940]] },
    { id: 'r-silverstone', nome: 'R. Silverstone', pontos: [[1700, 940], [1450, 940], [1200, 940], [760, 940], [300, 940], [-40, 940]] },
    { id: 'r-interlagos', nome: 'R. Interlagos', pontos: [[-40, 940], [-40, 790], [-40, 650], [-40, 250], [-40, -10]] },
    { id: 'r-monaco', nome: 'R. Mônaco', pontos: [[300, -10], [300, 150], [300, 250], [300, 495], [300, 650], [300, 790], [300, 940]] },
    { id: 'r-montreal', nome: 'R. Montreal', pontos: [[1200, 300], [1200, 650], [1200, 790], [1200, 940]] },
    { id: 'r-jeddah', nome: 'R. Jeddah', pontos: [[1450, 300], [1450, 790], [1450, 940]] },
    { id: 'r-suzuka', nome: 'R. Suzuka', pontos: [[300, 150], [760, 150]] },
    { id: 'r-hungaroring', nome: 'R. Hungaroring', pontos: [[-40, 250], [300, 250]] },
    { id: 'r-austin', nome: 'R. Austin', pontos: [[760, 300], [1200, 300], [1450, 300], [1700, 300]] },
    { id: 'r-imola', nome: 'R. Imola', pontos: [[300, 495], [760, 495]] },
    { id: 'r-baku', nome: 'R. Baku', pontos: [[-40, 650], [300, 650], [760, 650]] },
    { id: 'r-zandvoort', nome: 'R. Zandvoort', pontos: [[-40, 790], [300, 790], [760, 790], [1200, 790], [1450, 790], [1700, 790]] },
  ],

  /** Trânsito: quantos carros circulam pela malha. */
  transito: { quantidadeCarros: 56 },

  /** Regras das passagens de nível (valem para todas as ruas). */
  passagens: {
    folgaParada: 8,             // espaço extra entre a lateral do trem e a linha de parada
    folgaOcupado: 14,           // margem extra para considerar o trem "sobre" a passagem
    antecedenciaMinima: 200,    // fecha a cancela quando o trem está a esta distância (no trilho)…
    antecedenciaSegundos: 1.6,  // …ou a este tempo de chegada, o que for maior
    anguloMinimo: 25,           // cruzamentos mais rasos que isso (graus) são ignorados
  },

  /** Quarteirões gerados nos espaços livres, longe de trilhos e ruas. */
  cidade: { tamanhoQuadra: 52, afastamentoTrilho: 34, afastamentoRua: 10, chanceVazio: 0.22, semente: 500 },

  coresCarros: ['#d2ff00', '#ff5a36', '#3ddbd9', '#ffffff', '#ffb000', '#b18cff'],
};
