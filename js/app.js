/**
 * app.js — inicialização e regras da versão estilizada.
 *
 * Modos:
 *  - livre: sem rota; ao dar play, o trem roda e sorteia o caminho nas agulhas.
 *  - escolhendo: há um destino; o trem para e as rotas alternativas aparecem.
 *  - viajando: uma rota foi escolhida; o trem segue as decisões dela e para no destino.
 */
(function () {
  'use strict';

  const { circuito, movimento, trem, mapa, rotas, estrada, painel, configuracaoMapa } = window.XP500;

  const app = {
    modo: 'livre',
    destino: null,          // {segmentoId, distancia, x, y, nome}
    alternativas: [],
    rota: null,             // rota em viagem
    pernaAtual: 0,
    proximaDecisao: 0,
    destinoArmado: false,
    ultimaPosicao: null,
  };

  function iniciarAplicacao() {
    circuito.validarConfiguracao();
    const camadas = mapa.montarMapa(document.getElementById('mapa'), {
      aoEscolherPonto: (ponto) => escolherDestino({ ...ponto, nome: nomearPonto(ponto) }),
      aoEscolherEstacao: (estacao, ponto) => escolherDestino({ ...ponto, nome: estacao.nome }),
    });
    trem.prepararTrem(camadas.trem);
    estrada.prepararEstrada({ fundo: camadas.estrada, sinalizacao: camadas.sinalizacao, carros: camadas.carros });

    painel.prepararPainel({
      aoIniciar: iniciar,
      aoPausar: movimento.pausarMovimento,
      aoReiniciar: reiniciar,
      aoCancelarRota: cancelarRota,
      aoMudarVelocidade: mudarVelocidade,
      aoMudarVagoes: mudarQuantidadeVagoes,
      aoSelecionarRota: selecionarRota,
    });

    movimento.prepararMovimento({
      ouvintes: {
        aoMudarEstado: painel.atualizarStatus,
        aoMudarPosicao: aoMudarPosicao,
        aoSolicitarDecisao: decidirNaAgulha,
        aoInverterTrem: trem.inverterTrem,
        aoChegarDestino: chegarAoDestino,
        aoAviso: painel.exibirAviso,
      },
    });
    painel.atualizarVelocidade(movimento.obterEstado().velocidade);
    mudarQuantidadeVagoes(configuracaoMapa.vagoes.inicial);
    painel.definirDestino(null);
    setInterval(() => painel.atualizarEstatisticas(estrada.obterEstatisticas()), 250);
  }

  /** Nome amigável de um ponto clicado: a área do circuito onde ele fica. */
  function nomearPonto(ponto) {
    const fracao = ponto.distancia / circuito.obterComprimento(ponto.segmentoId);
    const area = circuito.configuracao.areas.find((a) => a.tipo === 'trecho' && a.segmento === ponto.segmentoId
      && fracao >= a.de && fracao <= a.ate);
    return area ? area.nome : circuito.obterSegmento(ponto.segmentoId).nome;
  }

  // ---------- Destino e rotas ----------

  /** Define o destino, para o trem e mostra as rotas possíveis. */
  function escolherDestino(destino) {
    movimento.pausarMovimento();
    movimento.definirDestino(null);
    app.destino = destino;
    app.rota = null;
    app.modo = 'escolhendo';
    mapa.desenharPino(destino);
    painel.definirDestino(destino.nome);
    const origem = movimento.obterEstado();
    app.alternativas = rotas.planejarRotas(origem, destino, configuracaoMapa.maximoRotas);
    if (app.alternativas.length === 0) {
      painel.exibirAviso('Nenhuma rota até esse ponto.');
      painel.limparRotas();
      mapa.limparRotas();
      return;
    }
    mostrarAlternativas();
    painel.exibirAviso(`${app.alternativas.length} ${app.alternativas.length === 1 ? 'rota encontrada' : 'rotas encontradas'} — escolha uma para partir`);
  }

  /** (Re)desenha rotas e cartões com a previsão na velocidade atual. */
  function mostrarAlternativas() {
    const velocidade = movimento.obterEstado().velocidade;
    const rotulos = app.alternativas.map((rota) => painel.formatarTempo(rota.comprimento / velocidade));
    mapa.desenharRotas(app.alternativas, 0, rotulos, selecionarRota);
    painel.mostrarRotas(app.alternativas, velocidade, null);
    painel.mostrarPassos(rotas.descreverPassos(app.alternativas[0], app.destino.nome));
  }

  /** O usuário escolheu uma rota: o trem parte e segue as decisões dela. */
  function selecionarRota(indice) {
    if (app.modo !== 'escolhendo' || !app.alternativas[indice]) return;
    app.rota = app.alternativas[indice];
    app.modo = 'viajando';
    app.pernaAtual = 0;
    app.proximaDecisao = 0;
    app.destinoArmado = false;
    mapa.desenharRotas([app.rota], 0, [], null);
    painel.mostrarRotas([app.rota], movimento.obterEstado().velocidade, 0);
    painel.mostrarPassos(rotas.descreverPassos(app.rota, app.destino.nome));
    armarDestinoSePreciso();
    atualizarViagem(movimento.obterEstado());
    movimento.iniciarMovimento();
  }

  /**
   * O ponto de parada só é entregue ao motor a partir da penúltima perna:
   * se a última perna repetir um trecho já usado antes, o trem não para cedo.
   */
  function armarDestinoSePreciso() {
    const ultima = app.rota.pernas.length - 1;
    if (app.destinoArmado || app.pernaAtual < ultima - 1) return;
    const final = app.rota.pernas[ultima];
    movimento.definirDestino({ segmentoId: final.segmentoId, distancia: final.fim, sentido: final.sentido });
    app.destinoArmado = true;
  }

  /** Tira a rota e o destino; o trem volta ao modo livre (parado). */
  function cancelarRota() {
    movimento.definirDestino(null);
    app.modo = 'livre';
    app.rota = null;
    app.destino = null;
    app.alternativas = [];
    mapa.limparRotas();
    mapa.limparPino();
    painel.limparRotas();
    painel.definirDestino(null);
  }

  function chegarAoDestino() {
    painel.exibirAviso(`Você chegou: ${app.destino.nome}`);
    painel.marcarPassoAtual(app.rota.pernas.length);
    painel.atualizarPrevisao(0, app.rota.comprimento, movimento.obterEstado().velocidade);
    app.modo = 'livre';
    app.rota = null;
    mapa.limparRotas();
    setTimeout(() => { if (app.modo === 'livre') { mapa.limparPino(); painel.definirDestino(null); } }, 2500);
  }

  // ---------- Movimento ----------

  /** Play: em viagem retoma; no modo livre roda sorteando nas agulhas. */
  function iniciar() {
    if (app.modo === 'escolhendo') {
      selecionarRota(0);
      return;
    }
    movimento.iniciarMovimento();
  }

  function reiniciar() {
    cancelarRota();
    trem.limparTrem();
    movimento.reiniciarCircuito();
  }

  function mudarVelocidade(valor) {
    const aplicada = movimento.atualizarVelocidade(valor);
    painel.atualizarVelocidade(aplicada);
    if (app.modo === 'escolhendo') mostrarAlternativas();
  }

  /** Põe ou tira vagões, dentro dos limites da configuração. */
  function mudarQuantidadeVagoes(quantidade) {
    const limites = configuracaoMapa.vagoes;
    const aplicada = Math.min(Math.max(Math.round(quantidade), limites.minimo), limites.maximo);
    trem.definirQuantidadeVagoes(aplicada);
    painel.atualizarVagoes(aplicada, limites);
  }

  /** Agulha à frente: em viagem usa a decisão da rota; no modo livre, sorteia. */
  function decidirNaAgulha({ noId, chegada }) {
    const no = circuito.obterNo(noId);
    const planejada = app.modo === 'viajando' ? app.rota.decisoes[app.proximaDecisao] : null;
    if (planejada && planejada.noId === noId) {
      app.proximaDecisao += 1;
      painel.exibirAviso(`${no.nome} → ${planejada.rotulo}`);
      movimento.aplicarEscolha(noId, planejada.caminhoId);
      return;
    }
    const caminhos = circuito.listarSaidas(noId, chegada);
    const sorteado = caminhos[Math.floor(Math.random() * caminhos.length)];
    movimento.aplicarEscolha(noId, sorteado.id);
  }

  function aoMudarPosicao(posicao) {
    trem.atualizarTrem(posicao);
    mapa.atualizarOrigem(posicao.x, posicao.y);
    if (app.modo === 'viajando') atualizarViagem(posicao);
  }

  /** Acompanha em que perna o trem está e atualiza previsão, progresso e passo atual. */
  function atualizarViagem(posicao) {
    const { pernas } = app.rota;
    const naPerna = (perna) => perna.segmentoId === posicao.segmentoId && perna.sentido === posicao.sentido;
    while (app.pernaAtual < pernas.length - 1 && !naPerna(pernas[app.pernaAtual])) app.pernaAtual += 1;
    armarDestinoSePreciso();
    const restante = rotas.calcularRestante(app.rota, app.pernaAtual, posicao.distancia);
    painel.atualizarPrevisao(restante, app.rota.comprimento, movimento.obterEstado().velocidade);
    painel.marcarPassoAtual(app.pernaAtual);
    mapa.atualizarProgressoRota(1 - restante / app.rota.comprimento);
  }

  document.addEventListener('DOMContentLoaded', iniciarAplicacao);
})();
