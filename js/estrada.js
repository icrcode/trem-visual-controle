/**
 * estrada.js — cidade: malha viária com carros (bolinhas), passagens de nível e quarteirões.
 *
 * - As ruas formam uma malha fechada: cada rua é dividida em trechos entre
 *   esquinas, com uma faixa por sentido (trânsito pela direita).
 * - Um número fixo de carros circula sem parar. Ao chegar a uma esquina, o
 *   carro faz uma curva para um trecho sorteado (retorno só se não houver saída).
 * - Só um carro por vez cruza cada esquina, e só se houver espaço na faixa de saída.
 * - As passagens de nível são achadas automaticamente onde um trecho cruza os
 *   trilhos. A cancela fecha quando o trem está passando ou chegando; os carros
 *   param na linha de parada e formam fila.
 * - Um carro só entra numa passagem se houver espaço do outro lado: nunca fica
 *   parado em cima dos trilhos.
 * - A animação dos carros é independente da do trem: continua com o trem pausado.
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  const NS_SVG = 'http://www.w3.org/2000/svg';
  const INTERVALO_MAXIMO_SEGUNDOS = 0.1;

  const config = () => window.XP500.configuracaoMapa;
  const circuito = () => window.XP500.circuito;

  /** Esquinas: chave "x,y" → {x, y, trechos, raio, ocupante}. */
  const esquinas = new Map();
  /** Trechos de rua entre duas esquinas (ver montarTrecho). */
  const trechos = [];
  /** Carros fazendo a curva numa esquina. */
  let carrosEmCurva = [];
  let grupoCarros = null;
  let ultimoInstante = null;

  function criar(tag, atributos, pai) {
    const elemento = document.createElementNS(NS_SVG, tag);
    Object.entries(atributos).forEach(([nome, valor]) => elemento.setAttribute(nome, valor));
    if (pai) pai.appendChild(elemento);
    return elemento;
  }

  // ---------- Montagem da malha ----------

  /**
   * Monta a malha, desenha cidade, ruas e passagens e coloca os carros para circular.
   * @param {Object} grupos {fundo, sinalizacao, carros} — grupos SVG.
   */
  function prepararEstrada(grupos) {
    grupoCarros = grupos.carros;
    montarMalha();
    desenharQuarteiroes(grupos.fundo);
    desenharRuas(grupos.fundo);
    trechos.forEach((trecho) => {
      trecho.passagens = localizarPassagens(trecho);
      trecho.passagens.forEach((passagem) => { passagem.elementos = desenharPassagem(grupos.sinalizacao, trecho, passagem); });
    });
    distribuirCarros(config().transito.quantidadeCarros);
    requestAnimationFrame(executarQuadro);
  }

  function obterEsquina(x, y) {
    const chave = `${x},${y}`;
    if (!esquinas.has(chave)) esquinas.set(chave, { x, y, trechos: [], raio: 0, ocupante: null });
    return esquinas.get(chave);
  }

  /** Cria trechos e esquinas a partir das ruas da configuração. */
  function montarMalha() {
    config().ruas.forEach((definicao) => {
      const rua = { ...config().padraoRua, ...definicao };
      for (let i = 0; i < rua.pontos.length - 1; i++) {
        const a = obterEsquina(...rua.pontos[i]);
        const b = obterEsquina(...rua.pontos[i + 1]);
        const trecho = montarTrecho(rua, a, b);
        a.trechos.push(trecho);
        b.trechos.push(trecho);
        trechos.push(trecho);
      }
    });
    esquinas.forEach((esquina) => {
      esquina.raio = Math.max(...esquina.trechos.map((t) => t.largura)) / 2 + 3;
      if (esquina.trechos.length < 2) console.warn(`[XP500] Rua sem saída em (${esquina.x}, ${esquina.y}).`);
    });
  }

  function montarTrecho(rua, a, b) {
    const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
    const direcao = { x: (b.x - a.x) / comprimento, y: (b.y - a.y) / comprimento };
    const trecho = {
      rua, a, b, comprimento, direcao,
      // Lado direito de quem anda de "a" para "b" (tela com y para baixo).
      normal: { x: -direcao.y, y: direcao.x },
      largura: rua.largura,
      deslocamentoFaixa: rua.deslocamentoFaixa,
      velocidadeCarro: rua.velocidadeCarro,
      raioCarro: rua.raioCarro,
      distanciaSeguranca: rua.raioCarro * 2 + 10,
      passagens: [],
      faixas: {},
    };
    [1, -1].forEach((sentido) => { trecho.faixas[sentido] = { trecho, sentido, carros: [] }; });
    return trecho;
  }

  /** Esquina de onde a faixa sai e esquina aonde ela chega. */
  const esquinaInicial = (faixa) => (faixa.sentido > 0 ? faixa.trecho.a : faixa.trecho.b);
  const esquinaFinal = (faixa) => (faixa.sentido > 0 ? faixa.trecho.b : faixa.trecho.a);
  /** Primeiro e último ponto (em "progresso") utilizáveis da faixa, fora das esquinas. */
  const progressoEntrada = (faixa) => esquinaInicial(faixa).raio;
  const progressoSaida = (faixa) => faixa.trecho.comprimento - esquinaFinal(faixa).raio;

  /** Ponto do trecho a uma distância "s" de "a", deslocado "lateral" para a direita de a→b. */
  function pontoNoTrecho(trecho, s, lateral = 0) {
    return {
      x: trecho.a.x + trecho.direcao.x * s + trecho.normal.x * lateral,
      y: trecho.a.y + trecho.direcao.y * s + trecho.normal.y * lateral,
    };
  }

  /** Ponto de um carro numa faixa (progresso medido no sentido da faixa). */
  function pontoNaFaixa(faixa, progresso) {
    const s = faixa.sentido > 0 ? progresso : faixa.trecho.comprimento - progresso;
    return pontoNoTrecho(faixa.trecho, s, faixa.sentido * faixa.trecho.deslocamentoFaixa);
  }

  /** Posição de uma passagem em "progresso" da faixa. */
  const progressoDaPassagem = (faixa, passagem) => (faixa.sentido > 0 ? passagem.s : faixa.trecho.comprimento - passagem.s);

  // ---------- Desenho ----------

  /** Asfalto dos trechos, miolo das esquinas, faixa central e nome de cada rua. */
  function desenharRuas(grupo) {
    const classeDe = (largura) => (largura >= 40 ? 'avenida' : 'rua');
    trechos.forEach((t) => {
      criar('line', { x1: t.a.x, y1: t.a.y, x2: t.b.x, y2: t.b.y, 'stroke-width': t.largura, class: classeDe(t.largura) }, grupo);
    });
    esquinas.forEach((e) => {
      const lado = 2 * e.raio - 6;
      criar('rect', { x: e.x - lado / 2, y: e.y - lado / 2, width: lado, height: lado, class: 'esquina' }, grupo);
    });
    trechos.forEach((t) => {
      const inicio = pontoNoTrecho(t, t.a.raio);
      const fim = pontoNoTrecho(t, t.comprimento - t.b.raio);
      criar('line', { x1: inicio.x, y1: inicio.y, x2: fim.x, y2: fim.y, class: `${classeDe(t.largura)}-centro` }, grupo);
    });
    // Nome no trecho mais longo de cada rua.
    config().ruas.forEach((definicao) => {
      const daRua = trechos.filter((t) => t.rua.id === definicao.id);
      const maior = daRua.reduce((m, t) => (t.comprimento > m.comprimento ? t : m), daRua[0]);
      let angulo = Math.atan2(maior.direcao.y, maior.direcao.x) * 180 / Math.PI;
      if (angulo > 90 || angulo <= -90) angulo += 180; // texto sempre legível
      const meio = pontoNoTrecho(maior, maior.comprimento * 0.5, maior.largura / 2 + 9);
      const rotulo = criar('text', { x: meio.x, y: meio.y, transform: `rotate(${angulo} ${meio.x} ${meio.y})`, 'text-anchor': 'middle', class: `${classeDe(maior.largura)}-nome` }, grupo);
      rotulo.textContent = maior.rua.nome.toUpperCase();
    });
  }

  /**
   * Quarteirões: uma grade de quadras; cada quadra só aparece se estiver longe
   * de trilhos, ruas e estações. Sorteio com semente fixa (sempre a mesma cidade).
   */
  function desenharQuarteiroes(grupo) {
    const { tamanhoQuadra, afastamentoTrilho, afastamentoRua, chanceVazio, semente } = config().cidade;
    const sortear = criarSorteio(semente);
    const trilhos = [];
    Object.keys(circuito().configuracao.segmentos).forEach((segmentoId) => {
      const comprimento = circuito().obterComprimento(segmentoId);
      for (let d = 0; d <= comprimento; d += 6) trilhos.push(circuito().obterPontoNoSegmento(segmentoId, d));
    });
    const estacoes = config().estacoes.map((e) => e.posicao);
    const tons = ['#1b1c1f', '#1f2024', '#222428', '#191a1d'];
    const { largura, altura } = circuito().configuracao.dimensoes;

    for (let y = -40; y + tamanhoQuadra <= altura + 40; y += tamanhoQuadra) {
      for (let x = -60; x + tamanhoQuadra <= largura + 60; x += tamanhoQuadra) {
        const centro = { x: x + tamanhoQuadra / 2, y: y + tamanhoQuadra / 2 };
        const alcance = tamanhoQuadra / 2;
        const livre = trilhos.every((p) => Math.hypot(p.x - centro.x, p.y - centro.y) > afastamentoTrilho + alcance)
          && trechos.every((t) => distanciaAteTrecho(t, centro) > t.largura / 2 + afastamentoRua + alcance)
          && estacoes.every((p) => Math.hypot(p.x - centro.x, p.y - centro.y) > 60);
        if (!livre || sortear() < chanceVazio) continue;
        const recuo = 5 + sortear() * 6;
        criar('rect', {
          x: x + recuo, y: y + recuo, width: tamanhoQuadra - 2 * recuo, height: tamanhoQuadra - 2 * recuo,
          rx: 3, fill: tons[Math.floor(sortear() * tons.length)], class: 'quarteirao',
        }, grupo);
      }
    }
  }

  function distanciaAteTrecho(trecho, ponto) {
    const s = Math.min(Math.max((ponto.x - trecho.a.x) * trecho.direcao.x + (ponto.y - trecho.a.y) * trecho.direcao.y, 0), trecho.comprimento);
    const maisProximo = pontoNoTrecho(trecho, s);
    return Math.hypot(maisProximo.x - ponto.x, maisProximo.y - ponto.y);
  }

  /** Gerador pseudoaleatório simples com semente (mulberry32). */
  function criarSorteio(semente) {
    let estado = semente >>> 0;
    return () => {
      estado = (estado + 0x6d2b79f5) >>> 0;
      let t = estado;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Passagens de nível ----------

  /** Procura os cruzamentos entre o trecho e cada segmento de trilho. */
  function localizarPassagens(trecho) {
    const encontradas = [];
    const anguloMinimo = config().passagens.anguloMinimo * Math.PI / 180;
    Object.keys(circuito().configuracao.segmentos).forEach((segmentoId) => {
      const comprimento = circuito().obterComprimento(segmentoId);
      let anterior = circuito().obterPontoNoSegmento(segmentoId, 0);
      for (let distancia = 1; distancia <= comprimento; distancia += 1) {
        const ponto = circuito().obterPontoNoSegmento(segmentoId, distancia);
        const cruzamento = intersectar(trecho, anterior, ponto);
        if (cruzamento && !encontradas.some((p) => Math.abs(p.s - cruzamento.s) < 10)) {
          const trilho = { x: ponto.x - anterior.x, y: ponto.y - anterior.y };
          const seno = Math.abs(trecho.direcao.x * trilho.y - trecho.direcao.y * trilho.x) / Math.hypot(trilho.x, trilho.y);
          if (Math.asin(Math.min(1, seno)) >= anguloMinimo) {
            encontradas.push({
              segmentoId, distancia: distancia - 1 + cruzamento.t, s: cruzamento.s, ...pontoNoTrecho(trecho, cruzamento.s),
              seno, recuo: calcularRecuoParada(trecho, seno), fechada: false,
            });
          }
        }
        anterior = ponto;
      }
    });
    return encontradas.sort((a, b) => a.s - b.s);
  }

  /**
   * Distância (ao longo da rua) da linha de parada até o centro do trilho:
   * meia largura do trem "esticada" pelo ângulo do cruzamento, mais a folga e
   * o raio do carro.
   */
  function calcularRecuoParada(trecho, seno) {
    const meiaLarguraTrem = circuito().configuracao.trem.largura / 2;
    return meiaLarguraTrem / seno + config().passagens.folgaParada + trecho.raioCarro;
  }

  /** Interseção do eixo do trecho com o trecho de trilho p→q; devolve {s (no trecho de rua), t (no de trilho)}. */
  function intersectar(trecho, p, q) {
    const r = { x: q.x - p.x, y: q.y - p.y };
    const d = { x: trecho.direcao.x * trecho.comprimento, y: trecho.direcao.y * trecho.comprimento };
    const denominador = d.x * r.y - d.y * r.x;
    if (Math.abs(denominador) < 1e-9) return null;
    const w = { x: p.x - trecho.a.x, y: p.y - trecho.a.y };
    const u = (w.x * r.y - w.y * r.x) / denominador;
    const t = (w.x * d.y - w.y * d.x) / denominador;
    if (u < 0 || u > 1 || t < 0 || t > 1) return null;
    return { s: u * trecho.comprimento, t };
  }

  /** Linhas de parada, cancelas e luzes de uma passagem de nível (uma de cada lado). */
  function desenharPassagem(grupo, trecho, passagem) {
    const elementos = { grupo: criar('g', { class: 'passagem' }, grupo) };
    [1, -1].forEach((sentido) => {
      // Quem anda no "sentido" para antes da passagem, na faixa da direita.
      const sParada = passagem.s - sentido * passagem.recuo;
      const centro = pontoNoTrecho(trecho, sParada, 0);
      const borda = pontoNoTrecho(trecho, sParada, sentido * trecho.largura / 2);
      criar('line', { x1: borda.x, y1: borda.y, x2: centro.x, y2: centro.y, class: 'linha-parada' }, elementos.grupo);
      criar('line', {
        x1: borda.x, y1: borda.y, x2: centro.x, y2: centro.y, class: 'cancela', style: `transform-origin: ${borda.x}px ${borda.y}px`,
      }, elementos.grupo);
      const luz = pontoNoTrecho(trecho, sParada, sentido * (trecho.largura / 2 + 6));
      criar('circle', { cx: luz.x, cy: luz.y, r: trecho.largura >= 40 ? 5 : 3.5, class: 'luz' }, elementos.grupo);
    });
    return elementos;
  }

  /**
   * Fecha cada cancela se o trem estiver sobre a passagem ou chegando a ela.
   * "Sobre" = algum ponto do eixo do trem perto o bastante para o corpo dele
   * invadir a faixa da rua.
   */
  function atualizarCancelas(ocupados, estadoTrem) {
    const meiaLarguraTrem = circuito().configuracao.trem.largura / 2;
    trechos.forEach((trecho) => {
      trecho.passagens.forEach((passagem) => {
        const raio = (trecho.largura / 2 + trecho.raioCarro) / passagem.seno + meiaLarguraTrem + config().passagens.folgaOcupado;
        const sobre = ocupados.some((p) => Math.hypot(p.x - passagem.x, p.y - passagem.y) < raio);
        const fechada = sobre || tremChegando(estadoTrem, passagem);
        if (fechada === passagem.fechada) return;
        passagem.fechada = fechada;
        passagem.elementos.grupo.classList.toggle('passagem--fechada', fechada);
      });
    });
  }

  /** O trem anda em direção à passagem, no mesmo segmento, dentro da antecedência? */
  function tremChegando(estadoTrem, passagem) {
    if (!estadoTrem.emMovimento || estadoTrem.segmentoId !== passagem.segmentoId) return false;
    const { antecedenciaMinima, antecedenciaSegundos } = config().passagens;
    const aFrente = (passagem.distancia - estadoTrem.distancia) * estadoTrem.sentido;
    return aFrente > 0 && aFrente < Math.max(antecedenciaMinima, estadoTrem.velocidade * antecedenciaSegundos);
  }

  // ---------- Carros ----------

  /** Espalha os carros pela malha, em faixas sorteadas, sem encostar uns nos outros nem nas passagens. */
  function distribuirCarros(quantidade) {
    const faixas = trechos.flatMap((t) => [t.faixas[1], t.faixas[-1]]);
    const cores = config().coresCarros;
    let tentativas = 0;
    let colocados = 0;
    while (colocados < quantidade && tentativas < quantidade * 50) {
      tentativas += 1;
      const faixa = faixas[Math.floor(Math.random() * faixas.length)];
      const entrada = progressoEntrada(faixa);
      const saida = progressoSaida(faixa);
      const progresso = entrada + Math.random() * (saida - entrada);
      const t = faixa.trecho;
      const livre = faixa.carros.every((c) => Math.abs(c.progresso - progresso) > t.distanciaSeguranca * 1.5)
        && t.passagens.every((p) => Math.abs(progressoDaPassagem(faixa, p) - progresso) > p.recuo + t.raioCarro);
      if (!livre) continue;
      const elemento = criar('circle', { r: t.raioCarro, class: 'carro-rua', fill: cores[colocados % cores.length] }, grupoCarros);
      const carro = { faixa, progresso, elemento, parado: false, proximo: null, curva: null };
      escolherProximaFaixa(carro);
      faixa.carros.push(carro);
      faixa.carros.sort((x, y) => y.progresso - x.progresso); // o da frente primeiro
      posicionarNaFaixa(carro);
      colocados += 1;
    }
  }

  /** Sorteia o trecho que o carro pegará na próxima esquina (retorno só sem alternativa). */
  function escolherProximaFaixa(carro) {
    const esquina = esquinaFinal(carro.faixa);
    const opcoes = esquina.trechos.filter((t) => t !== carro.faixa.trecho);
    const trecho = opcoes.length ? opcoes[Math.floor(Math.random() * opcoes.length)] : carro.faixa.trecho;
    carro.proximo = trecho.faixas[trecho.a === esquina ? 1 : -1];
  }

  function posicionarNaFaixa(carro) {
    const ponto = pontoNaFaixa(carro.faixa, carro.progresso);
    carro.elemento.setAttribute('cx', ponto.x.toFixed(1));
    carro.elemento.setAttribute('cy', ponto.y.toFixed(1));
  }

  /** Uma passagem fechada colada na entrada da faixa (sem lugar para parar antes dela)? */
  function entradaBloqueada(faixa) {
    return faixa.trecho.passagens.some((p) => p.fechada
      && progressoDaPassagem(faixa, p) - p.recuo < progressoEntrada(faixa) + faixa.trecho.distanciaSeguranca);
  }

  /** Há espaço no começo da faixa para mais um carro? */
  function haEspacoNaEntrada(faixa) {
    const ultimo = faixa.carros[faixa.carros.length - 1];
    return !ultimo || ultimo.progresso > progressoEntrada(faixa) + faixa.trecho.distanciaSeguranca;
  }

  /**
   * Move os carros de uma faixa, do primeiro ao último. Cada um avança até o
   * menor entre: o deslocamento livre, a distância de segurança do carro da
   * frente, a linha de parada de uma passagem fechada (ou sem espaço depois
   * dela) e a entrada da esquina. O primeiro da fila, na entrada da esquina,
   * começa a curva quando a esquina e a faixa de saída estão livres.
   */
  function moverFaixa(faixa, intervalo) {
    const t = faixa.trecho;
    const saida = progressoSaida(faixa);
    let limiteDaFrente = saida + t.distanciaSeguranca; // o 1º carro pode ir até a entrada da esquina
    let quemParte = null;
    faixa.carros.forEach((carro, indice) => {
      const atual = carro.progresso;
      const espacoLivre = limiteDaFrente - t.distanciaSeguranca;
      let alvo = Math.min(atual + t.velocidadeCarro * intervalo, espacoLivre);
      t.passagens.forEach((passagem) => {
        const centro = progressoDaPassagem(faixa, passagem);
        const linhaParada = centro - passagem.recuo;
        if (atual > linhaParada + 0.5) return; // já passou da linha
        if (passagem.fechada || espacoLivre < centro + passagem.recuo) alvo = Math.min(alvo, linhaParada);
      });
      alvo = Math.max(atual, alvo);
      carro.parado = intervalo > 0 && alvo - atual < t.velocidadeCarro * intervalo * 0.2;
      carro.progresso = alvo;
      posicionarNaFaixa(carro);
      limiteDaFrente = alvo;
      if (indice === 0 && alvo >= saida - 0.5 && podeEntrarNaEsquina(carro)) quemParte = carro;
    });
    if (quemParte) iniciarCurva(quemParte);
  }

  function podeEntrarNaEsquina(carro) {
    const esquina = esquinaFinal(carro.faixa);
    return !esquina.ocupante && haEspacoNaEntrada(carro.proximo) && !entradaBloqueada(carro.proximo);
  }

  /** Tira o carro da faixa e o coloca numa curva (Bézier quadrática) até a faixa seguinte. */
  function iniciarCurva(carro) {
    const de = carro.faixa;
    const para = carro.proximo;
    const esquina = esquinaFinal(de);
    const inicio = pontoNaFaixa(de, carro.progresso);
    const fim = pontoNaFaixa(para, progressoEntrada(para));
    const direcaoEntrada = { x: de.trecho.direcao.x * de.sentido, y: de.trecho.direcao.y * de.sentido };
    const direcaoSaida = { x: para.trecho.direcao.x * para.sentido, y: para.trecho.direcao.y * para.sentido };
    const controle = intersectarRetas(inicio, direcaoEntrada, fim, direcaoSaida)
      || { x: (inicio.x + fim.x) / 2, y: (inicio.y + fim.y) / 2 };
    const corda = Math.hypot(fim.x - inicio.x, fim.y - inicio.y);
    const poligono = Math.hypot(controle.x - inicio.x, controle.y - inicio.y) + Math.hypot(fim.x - controle.x, fim.y - controle.y);
    de.carros = de.carros.filter((c) => c !== carro);
    esquina.ocupante = carro;
    carro.curva = {
      esquina, inicio, controle, fim,
      comprimento: Math.max((corda + poligono) / 2, 1),
      percorrido: 0,
      velocidade: Math.min(de.trecho.velocidadeCarro, para.trecho.velocidadeCarro),
    };
    carro.parado = false;
    carrosEmCurva.push(carro);
  }

  /** Interseção das retas (p + a·u) e (q + b·v); null se forem paralelas. */
  function intersectarRetas(p, u, q, v) {
    const denominador = u.x * v.y - u.y * v.x;
    if (Math.abs(denominador) < 1e-6) return null;
    const a = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / denominador;
    return { x: p.x + u.x * a, y: p.y + u.y * a };
  }

  /** Avança os carros nas curvas; ao terminar, entram na faixa de saída. */
  function moverCurvas(intervalo) {
    carrosEmCurva = carrosEmCurva.filter((carro) => {
      const curva = carro.curva;
      curva.percorrido += curva.velocidade * intervalo;
      const t = Math.min(curva.percorrido / curva.comprimento, 1);
      const x = (1 - t) ** 2 * curva.inicio.x + 2 * (1 - t) * t * curva.controle.x + t ** 2 * curva.fim.x;
      const y = (1 - t) ** 2 * curva.inicio.y + 2 * (1 - t) * t * curva.controle.y + t ** 2 * curva.fim.y;
      carro.elemento.setAttribute('cx', x.toFixed(1));
      carro.elemento.setAttribute('cy', y.toFixed(1));
      if (t < 1) return true;
      curva.esquina.ocupante = null;
      carro.curva = null;
      carro.faixa = carro.proximo;
      carro.progresso = progressoEntrada(carro.faixa);
      carro.faixa.carros.push(carro); // entra como último da fila
      escolherProximaFaixa(carro);
      return false;
    });
  }

  // ---------- Animação ----------

  function executarQuadro(instante) {
    const intervalo = ultimoInstante === null ? 0 : Math.min((instante - ultimoInstante) / 1000, INTERVALO_MAXIMO_SEGUNDOS);
    ultimoInstante = instante;
    atualizarCancelas(window.XP500.trem.obterPontosOcupados(), window.XP500.movimento.obterEstado());
    trechos.forEach((trecho) => {
      moverFaixa(trecho.faixas[1], intervalo);
      moverFaixa(trecho.faixas[-1], intervalo);
    });
    moverCurvas(intervalo);
    requestAnimationFrame(executarQuadro);
  }

  /** @returns {{carros:number, aguardando:number, cancelasFechadas:number}} */
  function obterEstatisticas() {
    let carros = carrosEmCurva.length;
    let aguardando = 0;
    let cancelasFechadas = 0;
    trechos.forEach((trecho) => {
      [trecho.faixas[1], trecho.faixas[-1]].forEach((faixa) => {
        carros += faixa.carros.length;
        aguardando += faixa.carros.filter((c) => c.parado).length;
      });
      cancelasFechadas += trecho.passagens.filter((p) => p.fechada).length;
    });
    return { carros, aguardando, cancelasFechadas };
  }

  /** Lista das passagens de nível (para testes e depuração). */
  function listarPassagens() {
    return trechos.flatMap((t) => t.passagens.map(({ segmentoId, distancia, x, y, fechada }) => ({ rua: t.rua.id, segmentoId, distancia, x, y, fechada })));
  }

  /** Resumo da malha (para testes e depuração). */
  function descreverMalha() {
    return {
      esquinas: esquinas.size,
      trechos: trechos.length,
      semSaida: [...esquinas.values()].filter((e) => e.trechos.length < 2).length,
    };
  }

  window.XP500.estrada = {
    prepararEstrada,
    obterEstatisticas,
    listarPassagens,
    descreverMalha,
  };
})();
