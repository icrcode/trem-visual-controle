/**
 * principal.js
 * Inicialização: monta as camadas sobre o SVG e conecta os módulos.
 *
 * Fluxo de dados:
 *   controles  ──ações──▶  movimento  ──status/posição──▶  controles, areas, trem
 *                          movimento  ──bifurcação──────▶  decisoes
 *   decisoes   ──escolha──▶  movimento
 */
(function () {
  'use strict';

  /** Ponto de entrada da aplicação. */
  function iniciarAplicacao() {
    const { circuito, areas, decisoes, movimento, controles, trem, pista } = window.XP500;
    const camadaInterativa = document.getElementById('camada-interativa');

    circuito.validarConfiguracao();
    circuito.montarTracados(camadaInterativa.querySelector('#camada-tracados'));
    pista.desenharPista(camadaInterativa.querySelector('#camada-pista'));
    areas.montarAreas(
      camadaInterativa.querySelector('#camada-areas'),
      document.getElementById('tooltip-area'),
      document.getElementById('palco'),
    );
    trem.prepararTrem(camadaInterativa.querySelector('#camada-trem'));

    decisoes.prepararPainelDecisao({
      painel: document.getElementById('painel-decisao'),
      camadaPrevia: camadaInterativa.querySelector('#camada-previa'),
      aoConfirmar: movimento.aplicarEscolha,
      aoAviso: controles.exibirAviso,
    });

    controles.prepararControles({
      aoIniciar: movimento.iniciarMovimento,
      aoPausar: movimento.pausarMovimento,
      aoReiniciar: reiniciarAplicacao,
      aoMudarVelocidade: movimento.atualizarVelocidade,
      aoMudarModoDecisao: decisoes.definirModoAutomatico,
      modoAutomaticoInicial: decisoes.estaNoModoAutomatico(),
    });

    movimento.prepararMovimento({
      ouvintes: {
        aoMudarEstado: controles.atualizarStatus,
        aoSolicitarDecisao: decisoes.exibirDecisao,
        aoMudarPosicao: atualizarPosicaoNaInterface,
        aoInverterTrem: trem.inverterTrem,
        aoAviso: controles.exibirAviso,
      },
    });
  }

  /** Reinicia o trem e esconde qualquer decisão pendente. */
  function reiniciarAplicacao() {
    window.XP500.decisoes.ocultarDecisao();
    window.XP500.trem.limparTrem();
    window.XP500.movimento.reiniciarCircuito();
  }

  /** Redesenha o trem e mantém a área atual em sincronia com a frente dele. */
  function atualizarPosicaoNaInterface(posicao) {
    const { trem, areas, controles } = window.XP500;
    trem.atualizarTrem(posicao);
    const area = areas.identificarAreaAtual(posicao);
    areas.destacarAreaAtual(area);
    controles.atualizarAreaAtual(area);
  }

  document.addEventListener('DOMContentLoaded', iniciarAplicacao);
})();
