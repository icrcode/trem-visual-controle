/**
 * rotas.js — planejador de rotas (sem DOM).
 *
 * Uma rota é uma sequência de "pernas": trechos percorridos num único segmento
 * e sentido. Entre uma perna e outra o trem passa por um nó (agulha ou
 * para-choque). As rotas respeitam a topologia de ../js/circuito.js: só seguem
 * conexões reais, nunca cruzamentos.
 *
 * Formato:
 *   rota = {
 *     pernas: [{ segmentoId, sentido, inicio, fim, entrada }],
 *     decisoes: [{ noId, caminhoId, rotulo }],   // escolhas nas agulhas, em ordem
 *     comprimento,                               // unidades do desenho
 *   }
 *   entrada (da 2ª perna em diante) = { tipo: 'decisao'|'conexao'|'inversao', noId, rotulo? }
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  /** Limite de pernas por rota (o circuito é pequeno; evita voltas desnecessárias). */
  const MAXIMO_PERNAS = 10;

  const circuito = () => window.XP500.circuito;

  /**
   * Lista rotas do trem até o destino, da mais curta para a mais longa.
   * @param {{segmentoId:string, distancia:number, sentido:number}} origem Posição atual da frente do trem.
   * @param {{segmentoId:string, distancia:number}} destino Ponto da pista.
   * @param {number} maximo Quantidade máxima de rotas.
   * @returns {Array<Object>} Rotas distintas.
   */
  function planejarRotas(origem, destino, maximo) {
    const encontradas = [];
    const primeira = { segmentoId: origem.segmentoId, sentido: origem.sentido, inicio: origem.distancia, entrada: null };
    explorar(primeira, [], [], 0, {}, destino, encontradas);

    const vistas = new Set();
    return encontradas
      .sort((a, b) => a.comprimento - b.comprimento)
      .filter((rota) => {
        const assinatura = rota.pernas.map((p) => `${p.segmentoId}${p.sentido}`).join('|');
        if (vistas.has(assinatura)) return false;
        vistas.add(assinatura);
        return true;
      })
      .slice(0, maximo);
  }

  /**
   * Busca em profundidade pelas pernas possíveis.
   * Cada par (segmento, sentido) pode ser usado uma vez além da perna inicial —
   * o suficiente para dar a volta e alcançar um destino que ficou para trás.
   */
  function explorar(perna, anteriores, decisoes, acumulado, visitas, destino, encontradas) {
    const comprimentoSegmento = circuito().obterComprimento(perna.segmentoId);

    if (perna.segmentoId === destino.segmentoId) {
      const ateDestino = (destino.distancia - perna.inicio) * perna.sentido;
      if (ateDestino >= 0) {
        encontradas.push({
          pernas: anteriores.concat({ ...perna, fim: destino.distancia }),
          decisoes,
          comprimento: acumulado + ateDestino,
        });
        return;
      }
    }
    if (anteriores.length + 1 >= MAXIMO_PERNAS) return;

    const extremidade = perna.sentido > 0 ? 'fim' : 'inicio';
    const fimDaPerna = perna.sentido > 0 ? comprimentoSegmento : 0;
    const completa = { ...perna, fim: fimDaPerna };
    const percorrido = acumulado + Math.abs(fimDaPerna - perna.inicio);
    const noId = circuito().obterSegmento(perna.segmentoId)[extremidade];
    const no = circuito().obterNo(noId);
    if (!no) return;

    for (const proxima of listarProximasPernas(no, noId, perna, extremidade, fimDaPerna)) {
      const chave = `${proxima.perna.segmentoId}${proxima.perna.sentido}`;
      if ((visitas[chave] || 0) >= 1) continue;
      const novasDecisoes = proxima.decisao ? decisoes.concat(proxima.decisao) : decisoes;
      explorar(proxima.perna, anteriores.concat(completa), novasDecisoes, percorrido,
        { ...visitas, [chave]: (visitas[chave] || 0) + 1 }, destino, encontradas);
    }
  }

  /** Pernas que podem seguir a atual depois do nó, com a decisão necessária (se houver). */
  function listarProximasPernas(no, noId, perna, extremidade, fimDaPerna) {
    if (no.tipo === 'fim-de-linha') {
      if (no.acao !== 'inverter') return [];
      // O motor inverte o trem trocando a frente pela cauda: a nova perna começa um trem atrás.
      const comprimento = circuito().obterComprimento(perna.segmentoId);
      const inicio = Math.min(Math.max(fimDaPerna - perna.sentido * circuito().calcularComprimentoTrem(), 0), comprimento);
      return [{ perna: { segmentoId: perna.segmentoId, sentido: -perna.sentido, inicio, entrada: { tipo: 'inversao', noId } } }];
    }
    const saidas = circuito().listarSaidas(noId, { segmento: perna.segmentoId, extremidade });
    return saidas.map((saida) => {
      const entrada = saidas.length > 1
        ? { tipo: 'decisao', noId, rotulo: saida.rotulo }
        : { tipo: 'conexao', noId };
      return {
        perna: {
          segmentoId: saida.segmento,
          sentido: saida.extremidade === 'inicio' ? 1 : -1,
          inicio: saida.extremidade === 'inicio' ? 0 : circuito().obterComprimento(saida.segmento),
          entrada,
        },
        decisao: saidas.length > 1 ? { noId, caminhoId: saida.id, rotulo: saida.rotulo } : null,
      };
    });
  }

  /**
   * Distância que falta até o destino, com o trem na perna "indice".
   * @param {Object} rota
   * @param {number} indice Perna atual.
   * @param {number} distancia Posição da frente do trem no segmento da perna atual.
   * @returns {number}
   */
  function calcularRestante(rota, indice, distancia) {
    let restante = Math.max(0, (rota.pernas[indice].fim - distancia) * rota.pernas[indice].sentido);
    for (let i = indice + 1; i < rota.pernas.length; i++) {
      restante += Math.abs(rota.pernas[i].fim - rota.pernas[i].inicio);
    }
    return restante;
  }

  /**
   * Amostra os pontos da rota para desenhá-la (uma lista de pontos por perna).
   * @param {Object} rota
   * @param {number} [passo=6]
   * @returns {Array<Array<{x:number, y:number}>>}
   */
  function amostrarRota(rota, passo = 6) {
    return rota.pernas.map((perna) => {
      const total = Math.abs(perna.fim - perna.inicio);
      const pontos = [];
      for (let percorrido = 0; percorrido < total; percorrido += passo) {
        pontos.push(circuito().obterPontoNoSegmento(perna.segmentoId, perna.inicio + percorrido * perna.sentido));
      }
      pontos.push(circuito().obterPontoNoSegmento(perna.segmentoId, perna.fim));
      return pontos;
    });
  }

  /**
   * Instruções passo a passo, como num GPS.
   * @param {Object} rota
   * @param {string} nomeDestino
   * @returns {Array<{icone:string, texto:string, distancia:number}>}
   */
  function descreverPassos(rota, nomeDestino) {
    const passos = rota.pernas.map((perna) => {
      const distancia = Math.abs(perna.fim - perna.inicio);
      const segmento = circuito().obterSegmento(perna.segmentoId).nome;
      const entrada = perna.entrada;
      if (!entrada) return { icone: 'seguir', texto: `Siga pela ${segmento}`, distancia };
      const no = circuito().obterNo(entrada.noId).nome;
      if (entrada.tipo === 'decisao') return { icone: 'agulha', texto: `${no}: pegue ${entrada.rotulo}`, distancia };
      if (entrada.tipo === 'inversao') return { icone: 'inverter', texto: `${no}: inverta o sentido`, distancia };
      return { icone: 'seguir', texto: `Passe a ${no} e siga pela ${segmento}`, distancia };
    });
    passos.push({ icone: 'destino', texto: `Chegada: ${nomeDestino}`, distancia: 0 });
    return passos;
  }

  window.XP500.rotas = {
    planejarRotas,
    calcularRestante,
    amostrarRota,
    descreverPassos,
  };
})();
