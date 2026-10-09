/**
 * controles.js
 * Painel de controles: botões Iniciar/Pausar/Reiniciar, controle de
 * velocidade e indicadores (velocidade, status, área atual, último evento).
 * As ações são executadas por callbacks recebidos em prepararControles().
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  /** Tempo (ms) que um aviso permanece visível. */
  const DURACAO_AVISO = 3500;

  const elementos = {};
  let temporizadorAviso = null;
  let unidadeVelocidade = '';

  /**
   * Liga os controles da página às ações da aplicação.
   * @param {Object} acoes
   * @param {function():void} acoes.aoIniciar
   * @param {function():void} acoes.aoPausar
   * @param {function():void} acoes.aoReiniciar
   * @param {function(number):number} acoes.aoMudarVelocidade Recebe o valor do controle e devolve o aplicado.
   * @param {function(boolean):void} acoes.aoMudarModoDecisao Recebe true para decisão automática.
   * @param {boolean} acoes.modoAutomaticoInicial Estado inicial da chave de decisão automática.
   */
  function prepararControles(acoes) {
    ['iniciar', 'pausar', 'reiniciar', 'velocidade', 'valorVelocidade', 'status', 'textoStatus', 'areaAtual', 'aviso', 'decisaoAutomatica']
      .forEach((nome) => { elementos[nome] = document.querySelector(`[data-controle="${nome}"]`); });

    const { velocidade } = window.XP500.circuito.configuracao;
    unidadeVelocidade = velocidade.unidade;
    Object.assign(elementos.velocidade, { min: velocidade.minima, max: velocidade.maxima, step: velocidade.passo });
    elementos.velocidade.value = velocidade.inicial;

    elementos.iniciar.addEventListener('click', acoes.aoIniciar);
    elementos.pausar.addEventListener('click', acoes.aoPausar);
    elementos.reiniciar.addEventListener('click', acoes.aoReiniciar);
    elementos.velocidade.addEventListener('input', () => {
      atualizarIndicadorVelocidade(acoes.aoMudarVelocidade(Number(elementos.velocidade.value)));
    });
    atualizarIndicadorVelocidade(velocidade.inicial);

    elementos.decisaoAutomatica.checked = acoes.modoAutomaticoInicial;
    elementos.decisaoAutomatica.addEventListener('change', () => acoes.aoMudarModoDecisao(elementos.decisaoAutomatica.checked));
  }

  /** Mostra a velocidade atual com a unidade configurada. */
  function atualizarIndicadorVelocidade(valor) {
    elementos.valorVelocidade.textContent = `${valor} ${unidadeVelocidade}`;
  }

  /**
   * Atualiza o indicador de status e habilita apenas os botões que fazem sentido.
   * @param {{codigo:string, mensagem:string, emMovimento:boolean}} status
   */
  function atualizarStatus(status) {
    elementos.status.dataset.estado = status.codigo;
    elementos.textoStatus.textContent = status.mensagem;
    elementos.iniciar.disabled = status.emMovimento || status.codigo === 'erro';
    elementos.pausar.disabled = !status.emMovimento;
  }

  /** Mostra o nome da área em que o trem está. */
  function atualizarAreaAtual(area) {
    const texto = area ? area.nome : '—';
    if (elementos.areaAtual.textContent !== texto) elementos.areaAtual.textContent = texto;
  }

  /** Exibe um aviso temporário (ex.: inversão no para-choque). */
  function exibirAviso(mensagem) {
    elementos.aviso.textContent = mensagem;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { elementos.aviso.textContent = ''; }, DURACAO_AVISO);
  }

  window.XP500.controles = {
    prepararControles,
    atualizarIndicadorVelocidade,
    atualizarStatus,
    atualizarAreaAtual,
    exibirAviso,
  };
})();
