/**
 * movimento.js
 * Motor de movimentação do trem: posição da frente do trem sobre os
 * segmentos, avanço por requestAnimationFrame, velocidade, pausa, retomada e
 * passagem pelos nós.
 *
 * Este módulo não acessa o DOM: comunica-se com a interface (desenho do trem,
 * painel) apenas pelos "ouvintes" recebidos em prepararMovimento().
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  /** Maior intervalo considerado entre quadros (evita saltos ao voltar de outra aba). */
  const INTERVALO_MAXIMO_SEGUNDOS = 0.1;
  /** Limite de passagens por nó num único quadro (proteção contra laços infinitos). */
  const MAXIMO_PASSAGENS_POR_QUADRO = 20;
  const TOLERANCIA = 1e-6;

  const estado = {
    segmentoId: null,
    distancia: 0,
    sentido: 1,
    velocidade: 0,
    emMovimento: false,
    /** {noId, chegada} enquanto o trem espera uma escolha do usuário. */
    decisaoPendente: null,
    /** Escolhas confirmadas, ainda não usadas, por agulha: {noId: caminhoId}. */
    escolhasConfirmadas: {},
    erro: null,
    ultimoInstante: null,
    quadroAgendado: null,
  };

  let ouvintes = {};

  const circuito = () => window.XP500.circuito;
  const decisoes = () => window.XP500.decisoes;

  /**
   * Prepara o motor e posiciona o trem no ponto inicial.
   * @param {Object} opcoes
   * @param {Object} opcoes.ouvintes Funções chamadas pelo motor:
   *   aoMudarEstado(status), aoMudarPosicao(posicao), aoSolicitarDecisao(pendencia),
   *   aoInverterTrem(), aoAviso(mensagem).
   */
  function prepararMovimento(opcoes) {
    ouvintes = opcoes.ouvintes || {};
    estado.velocidade = circuito().configuracao.velocidade.inicial;
    reiniciarCircuito();
  }

  /** Começa ou retoma a animação. Não faz nada se houver erro de configuração. */
  function iniciarMovimento() {
    if (estado.emMovimento || estado.erro) return;
    estado.emMovimento = true;
    estado.ultimoInstante = null;
    estado.quadroAgendado = requestAnimationFrame(executarQuadro);
    notificarEstado();
  }

  /** Interrompe a animação mantendo a posição atual. */
  function pausarMovimento() {
    estado.emMovimento = false;
    if (estado.quadroAgendado !== null) cancelAnimationFrame(estado.quadroAgendado);
    estado.quadroAgendado = null;
    notificarEstado();
  }

  /** Para a animação e devolve o trem à posição inicial da configuração. */
  function reiniciarCircuito() {
    const { posicaoInicial } = circuito().configuracao;
    pausarMovimento();
    estado.decisaoPendente = null;
    estado.escolhasConfirmadas = {};
    estado.erro = null;
    if (!circuito().obterSegmento(posicaoInicial.segmento)) {
      registrarErro(`Posição inicial inválida: segmento "${posicaoInicial.segmento}" não existe.`);
      return;
    }
    estado.segmentoId = posicaoInicial.segmento;
    estado.distancia = Math.min(posicaoInicial.distancia, circuito().obterComprimento(posicaoInicial.segmento));
    estado.sentido = posicaoInicial.sentido >= 0 ? 1 : -1;
    atualizarPosicaoTrem();
    notificarEstado('pronta');
  }

  /**
   * Define a velocidade, limitada aos valores mínimo e máximo da configuração.
   * @param {number} novaVelocidade Em unidades do desenho por segundo.
   * @returns {number} Velocidade efetivamente aplicada.
   */
  function atualizarVelocidade(novaVelocidade) {
    const { minima, maxima } = circuito().configuracao.velocidade;
    estado.velocidade = Math.min(Math.max(Number(novaVelocidade) || minima, minima), maxima);
    return estado.velocidade;
  }

  /**
   * Registra a escolha do usuário para a agulha em que o trem está parado
   * e libera a movimentação (se o usuário não tiver pausado).
   * @param {string} noId Agulha da decisão.
   * @param {string} caminhoId Identificador do caminho escolhido ("A", "B"…).
   */
  function aplicarEscolha(noId, caminhoId) {
    if (!estado.decisaoPendente || estado.decisaoPendente.noId !== noId) return;
    estado.escolhasConfirmadas[noId] = caminhoId;
    estado.decisaoPendente = null;
    notificarEstado();
  }

  /**
   * Um quadro da animação. O deslocamento depende do tempo real decorrido,
   * não da taxa de quadros do dispositivo.
   * @param {DOMHighResTimeStamp} instante
   */
  function executarQuadro(instante) {
    if (!estado.emMovimento) return;
    const intervalo = estado.ultimoInstante === null ? 0 : (instante - estado.ultimoInstante) / 1000;
    estado.ultimoInstante = instante;
    if (!estado.decisaoPendente) {
      calcularProximaPosicao(estado.velocidade * Math.min(intervalo, INTERVALO_MAXIMO_SEGUNDOS));
      atualizarPosicaoTrem();
    }
    if (estado.emMovimento) estado.quadroAgendado = requestAnimationFrame(executarQuadro);
  }

  /**
   * Avança o trem por uma distância, atravessando quantos nós forem
   * necessários. Para antes de uma agulha sem escolha confirmada.
   * @param {number} distanciaAPercorrer Em unidades do desenho.
   */
  function calcularProximaPosicao(distanciaAPercorrer) {
    let restante = distanciaAPercorrer;
    for (let passagem = 0; restante > TOLERANCIA && passagem < MAXIMO_PASSAGENS_POR_QUADRO; passagem++) {
      const comprimento = circuito().obterComprimento(estado.segmentoId);
      const extremidade = estado.sentido > 0 ? 'fim' : 'inicio';
      const distanciaAteNo = estado.sentido > 0 ? comprimento - estado.distancia : estado.distancia;
      const noId = circuito().obterSegmento(estado.segmentoId)[extremidade];
      const chegada = { segmento: estado.segmentoId, extremidade };

      if (exigeParadaNoNo(noId, chegada)) {
        const pontoDeParada = Math.max(0, distanciaAteNo - circuito().configuracao.distanciaParadaAntesDaAgulha);
        if (restante >= pontoDeParada) {
          deslocarNoSegmento(pontoDeParada);
          restante -= pontoDeParada;
          solicitarDecisao(noId, chegada);
          if (estado.decisaoPendente) return; // espera o usuário
          continue; // escolha automática: segue sem parar
        }
      }
      if (restante < distanciaAteNo) {
        deslocarNoSegmento(restante);
        return;
      }
      deslocarNoSegmento(distanciaAteNo);
      restante -= distanciaAteNo;
      if (!atravessarNo(noId, chegada)) return;
    }
  }

  /** Há uma bifurcação à frente e o usuário ainda não confirmou o caminho? */
  function exigeParadaNoNo(noId, chegada) {
    return decisoes().verificarBifurcacao(noId, chegada) && !estado.escolhasConfirmadas[noId];
  }

  /** Move o trem dentro do segmento atual, no sentido atual. */
  function deslocarNoSegmento(distancia) {
    estado.distancia += distancia * estado.sentido;
  }

  /**
   * Leva o trem do segmento atual para o próximo, conforme o tipo do nó.
   * @returns {boolean} true se o trem pode continuar andando neste quadro.
   */
  function atravessarNo(noId, chegada) {
    const no = circuito().obterNo(noId);
    if (!no) return registrarErro(`O segmento "${chegada.segmento}" termina no nó inexistente "${noId}".`);

    if (no.tipo === 'fim-de-linha') return tratarFimDeLinha(no);

    const saidas = circuito().listarSaidas(noId, chegada);
    if (saidas.length === 0) {
      return registrarErro(`Sem conexão válida em "${no.nome}" vindo do segmento "${chegada.segmento}".`);
    }
    let saida = saidas[0];
    if (saidas.length > 1) {
      saida = saidas.find((opcao) => opcao.id === estado.escolhasConfirmadas[noId]);
      delete estado.escolhasConfirmadas[noId];
      if (!saida) {
        solicitarDecisao(noId, chegada);
        return false;
      }
    }
    return entrarNoSegmento(saida.segmento, saida.extremidade);
  }

  /**
   * Aplica a ação configurada para um para-choque ("inverter" ou "parar").
   * Ao inverter, a frente do trem passa a ser a outra ponta da composição
   * (a locomotiva empurra os vagões): a posição controlada salta para a cauda,
   * que fica um comprimento de trem atrás, sobre o mesmo segmento.
   */
  function tratarFimDeLinha(no) {
    if (no.acao === 'inverter') {
      const comprimentoTrem = circuito().calcularComprimentoTrem();
      const comprimentoSegmento = circuito().obterComprimento(estado.segmentoId);
      estado.distancia = Math.min(Math.max(estado.distancia - estado.sentido * comprimentoTrem, 0), comprimentoSegmento);
      estado.sentido *= -1;
      if (ouvintes.aoInverterTrem) ouvintes.aoInverterTrem();
      avisar(`${no.nome}: sentido invertido.`);
      return true;
    }
    avisar(`${no.nome}: o trem parou no fim da linha.`);
    pausarMovimento();
    return false;
  }

  /**
   * Coloca o trem numa extremidade de um segmento, andando para dentro dele.
   * As extremidades conectadas têm as mesmas coordenadas, então não há salto visual.
   * @returns {boolean} false se o segmento de destino não existir.
   */
  function entrarNoSegmento(segmentoId, extremidade) {
    if (!circuito().obterSegmento(segmentoId)) {
      return registrarErro(`A conexão aponta para o segmento inexistente "${segmentoId}".`);
    }
    estado.segmentoId = segmentoId;
    estado.distancia = extremidade === 'inicio' ? 0 : circuito().obterComprimento(segmentoId);
    estado.sentido = extremidade === 'inicio' ? 1 : -1;
    return true;
  }

  /**
   * Marca a espera por decisão e avisa a interface (uma única vez por parada).
   * A interface pode responder na hora (modo automático) chamando aplicarEscolha().
   */
  function solicitarDecisao(noId, chegada) {
    if (estado.decisaoPendente) return;
    estado.decisaoPendente = { noId, chegada };
    if (ouvintes.aoSolicitarDecisao) ouvintes.aoSolicitarDecisao({ noId, chegada });
    if (estado.decisaoPendente) notificarEstado();
  }

  /** Calcula o ponto da frente do trem e o entrega à interface, que o desenha. */
  function atualizarPosicaoTrem() {
    const ponto = circuito().obterPontoNoSegmento(estado.segmentoId, estado.distancia);
    if (ouvintes.aoMudarPosicao) {
      ouvintes.aoMudarPosicao({
        segmentoId: estado.segmentoId, distancia: estado.distancia, sentido: estado.sentido, x: ponto.x, y: ponto.y,
      });
    }
  }

  /** Interrompe tudo por causa de uma configuração inválida. */
  function registrarErro(mensagem) {
    console.error('[XP500] ' + mensagem);
    estado.erro = mensagem;
    estado.emMovimento = false;
    notificarEstado();
    return false;
  }

  function avisar(mensagem) {
    if (ouvintes.aoAviso) ouvintes.aoAviso(mensagem);
  }

  /**
   * Envia à interface o status atual.
   * @param {string} [codigoForcado] Usado para o estado "pronta" após reiniciar.
   */
  function notificarEstado(codigoForcado) {
    if (!ouvintes.aoMudarEstado) return;
    let status;
    if (estado.erro) {
      status = { codigo: 'erro', mensagem: estado.erro };
    } else if (estado.decisaoPendente) {
      const no = circuito().obterNo(estado.decisaoPendente.noId);
      status = { codigo: 'aguardando', mensagem: `Aguardando decisão na ${no.nome}` };
    } else if (codigoForcado === 'pronta') {
      status = { codigo: 'pronta', mensagem: 'Pronta na posição inicial' };
    } else if (estado.emMovimento) {
      status = { codigo: 'movimento', mensagem: 'Em movimento' };
    } else {
      status = { codigo: 'pausada', mensagem: 'Pausada' };
    }
    status.emMovimento = estado.emMovimento;
    ouvintes.aoMudarEstado(status);
  }

  /** Cópia somente leitura do estado, útil para testes e depuração. */
  function obterEstado() {
    return JSON.parse(JSON.stringify({
      segmentoId: estado.segmentoId,
      distancia: estado.distancia,
      sentido: estado.sentido,
      velocidade: estado.velocidade,
      emMovimento: estado.emMovimento,
      decisaoPendente: estado.decisaoPendente,
      erro: estado.erro,
    }));
  }

  window.XP500.movimento = {
    prepararMovimento,
    iniciarMovimento,
    pausarMovimento,
    reiniciarCircuito,
    atualizarVelocidade,
    aplicarEscolha,
    calcularProximaPosicao,
    atualizarPosicaoTrem,
    obterEstado,
  };
})();
