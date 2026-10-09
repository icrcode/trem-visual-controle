"""
Gerador dos traçados-guia (eixos centrais dos trilhos) do circuito XP500.

O arquivo assets/xp-500.svg é um desenho vetorizado (contorno preenchido):
seus caminhos descrevem as BORDAS dos trilhos, não o eixo por onde a bolinha
deve andar. Este script extrai o eixo central de cada segmento a partir da
geometria original, sem alterá-la:

  1. rasteriza o <path> original (regra par-ímpar) em 2x de resolução;
  2. afina a máscara até 1 pixel (esqueleto);
  3. liga os pontos de passagem de cada segmento pelo menor caminho no
     esqueleto — os pontos de passagem atravessam os cruzamentos em linha reta,
     então cruzamentos nunca viram conexões;
  4. suaviza o resultado e arredonda as agulhas com uma curva tangente ao
     trilho principal;
  5. imprime o atributo "d" de cada segmento, pronto para js/circuito.js.

Uso (requer numpy, scipy, matplotlib e opencv-contrib-python):
    python ferramentas/gerar_tracados.py assets/xp-500.svg
"""
import re
import sys

import cv2
import numpy as np
from matplotlib.path import Path
from scipy.ndimage import gaussian_filter1d
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

ESCALA = 2           # resolução da rasterização (pixels por unidade do viewBox)
LARGURA, ALTURA = 1661, 947
PASSO_SAIDA = 8.0    # distância entre pontos do traçado gerado
RAIO_AGULHA = 80     # trecho refeito com curva suave junto a cada agulha

NOS = {
    "agulha-norte": (456, 72),
    "agulha-central": (372, 560),
    "agulha-sul": (1058, 862),
    "para-choque": (1157, 677),
}
NOS_SEM_SUAVIZACAO = {"para-choque"}

# Pontos de passagem aproximados de cada segmento, na ordem de percurso.
PONTOS_DE_PASSAGEM = {
    "principal": ["agulha-norte", (800, 72), (1140, 73), (1300, 150), (1357, 320),
                  (1355, 350), (1340, 410), (1280, 490), (1100, 560), (950, 520),
                  (820, 435), (500, 432), (260, 435), (175, 465), (150, 490),
                  (110, 540), (85, 650), (150, 800), (300, 862), (700, 862), "agulha-sul"],
    "oeste": ["agulha-norte", (270, 72), (100, 170), (45, 320), (90, 460), (110, 495),
              (150, 530), (215, 560), "agulha-central"],
    "diagonal-norte": ["agulha-norte", (560, 140), (700, 225), (850, 228), (1000, 300),
                       (1150, 375), (1320, 376), (1390, 385), (1500, 430), (1590, 630),
                       (1500, 800), (1300, 862), "agulha-sul"],
    "diagonal-sul": ["agulha-central", (450, 620), (650, 728), (800, 730), (950, 780),
                     "agulha-sul"],
    "ramal": ["agulha-central", (850, 560), (1000, 610), "para-choque"],
}


def ler_caminho_original(caminho_svg):
    """Converte o <path> do potrace (comandos relativos m/c/l/z) em polígonos no viewBox."""
    texto = open(caminho_svg, encoding="utf-8").read()
    dados = re.search(r'<path d="([^"]+)"', texto, re.S).group(1)
    simbolos = re.findall(r"[a-zA-Z]|-?\d+\.?\d*", dados)
    vertices, codigos = [], []
    posicao, comando, inicio_sub = np.zeros(2), None, None
    i = 0

    def transformar(p):  # translate(0,947) scale(0.1,-0.1) do SVG original
        return (p[0] * 0.1, ALTURA - p[1] * 0.1)

    def ler_par():
        nonlocal i
        par = np.array([float(simbolos[i]), float(simbolos[i + 1])])
        i += 2
        return par

    while i < len(simbolos):
        if simbolos[i].isalpha():
            comando = simbolos[i]
            i += 1
            if comando in "zZ":
                vertices.append(transformar(inicio_sub))
                codigos.append(Path.CLOSEPOLY)
                posicao = inicio_sub.copy()
                continue
        if comando in "Mm":
            par = ler_par()
            posicao = posicao + par if comando == "m" and inicio_sub is not None else par
            inicio_sub = posicao.copy()
            vertices.append(transformar(posicao))
            codigos.append(Path.MOVETO)
            comando = "l"
        elif comando == "c":
            pontos = [posicao + ler_par() for _ in range(3)]
            vertices += [transformar(p) for p in pontos]
            codigos += [Path.CURVE4] * 3
            posicao = pontos[2]
        elif comando == "l":
            posicao = posicao + ler_par()
            vertices.append(transformar(posicao))
            codigos.append(Path.LINETO)
        else:
            raise ValueError(f"Comando SVG não suportado: {comando}")
    return Path(vertices, codigos).to_polygons()


def rasterizar(poligonos):
    """Preenche os polígonos com a regra par-ímpar (os furos do desenho ficam vazios)."""
    mascara = np.zeros((ALTURA * ESCALA, LARGURA * ESCALA), np.uint8)
    for poligono in poligonos:
        camada = np.zeros_like(mascara)
        cv2.fillPoly(camada, [np.round(np.array(poligono) * ESCALA).astype(np.int32)], 1)
        mascara ^= camada
    return mascara * 255


def montar_grafo_esqueleto(mascara):
    """Afina a máscara e devolve (coordenadas dos pixels, grafo de vizinhança 8-conexa)."""
    esqueleto = cv2.ximgproc.thinning(mascara)
    ys, xs = np.nonzero(esqueleto)
    indice = -np.ones(esqueleto.shape, int)
    indice[ys, xs] = np.arange(len(xs))
    origens, destinos, pesos = [], [], []
    for dy, dx in [(0, 1), (1, 0), (1, 1), (1, -1)]:
        y2, x2 = ys + dy, xs + dx
        validos = (y2 < esqueleto.shape[0]) & (x2 >= 0) & (x2 < esqueleto.shape[1])
        vizinhos = indice[y2[validos], x2[validos]]
        existe = vizinhos >= 0
        origens += list(np.arange(len(xs))[validos][existe])
        destinos += list(vizinhos[existe])
        pesos += [np.hypot(dx, dy)] * int(existe.sum())
    grafo = coo_matrix((pesos + pesos, (origens + destinos, destinos + origens)),
                       shape=(len(xs), len(xs))).tocsr()
    return np.c_[xs, ys] / ESCALA, grafo


def tracar_rota(pontos_esqueleto, grafo, pontos_passagem):
    """Liga os pontos de passagem pelo menor caminho no esqueleto."""
    indices = [int(np.argmin(np.hypot(*(pontos_esqueleto - p).T))) for p in pontos_passagem]
    rota = []
    for origem, destino in zip(indices, indices[1:]):
        _, antecessores = dijkstra(grafo, indices=origem, return_predecessors=True)
        trecho = [destino]
        while trecho[-1] != origem:
            trecho.append(antecessores[trecho[-1]])
        trecho.reverse()
        rota += trecho if not rota else trecho[1:]
    return pontos_esqueleto[rota]


def reamostrar(pontos, passo):
    distancias = np.r_[0, np.cumsum(np.hypot(*np.diff(pontos, axis=0).T))]
    alvos = np.r_[np.arange(0, distancias[-1], passo), distancias[-1]]
    return np.c_[np.interp(alvos, distancias, pontos[:, 0]), np.interp(alvos, distancias, pontos[:, 1])]


def suavizar(pontos, sigma=6):
    """Filtro gaussiano com espelhamento nas pontas, preservando as extremidades."""
    margem = 3 * sigma
    inicio = [2 * pontos[0] - pontos[i] for i in range(margem, 0, -1)]
    fim = [2 * pontos[-1] - pontos[-1 - i] for i in range(1, margem + 1)]
    estendido = np.r_[inicio, pontos, fim]
    filtrado = np.c_[gaussian_filter1d(estendido[:, 0], sigma), gaussian_filter1d(estendido[:, 1], sigma)]
    return filtrado[margem:-margem]


def suavizar_agulha(pontos, no, no_no_fim):
    """Refaz o trecho junto à agulha com uma Bézier tangente ao trilho horizontal."""
    if no_no_fim:
        pontos = pontos[::-1]
    no = np.array(no, float)
    k = int(np.argmax(np.hypot(*(pontos - no).T) > RAIO_AGULHA))
    alvo = pontos[k]
    tangente = pontos[k + 8] - pontos[k]
    tangente /= np.hypot(*tangente)
    alcance = np.hypot(*(alvo - no)) / 3
    controle1 = no + np.array([np.sign(alvo[0] - no[0]) * alcance, 0])
    controle2 = alvo - tangente * alcance
    t = np.linspace(0, 1, 60)[:, None]
    curva = (1 - t) ** 3 * no + 3 * (1 - t) ** 2 * t * controle1 + 3 * (1 - t) * t ** 2 * controle2 + t ** 3 * alvo
    pontos = np.r_[curva, pontos[k + 1:]]
    return pontos[::-1] if no_no_fim else pontos


def gerar(caminho_svg):
    pontos_esqueleto, grafo = montar_grafo_esqueleto(rasterizar(ler_caminho_original(caminho_svg)))
    for segmento, passagem in PONTOS_DE_PASSAGEM.items():
        coordenadas = [NOS[p] if isinstance(p, str) else p for p in passagem]
        pontos = suavizar(reamostrar(tracar_rota(pontos_esqueleto, grafo, coordenadas), 1.0))
        for posicao, no in ((0, passagem[0]), (-1, passagem[-1])):
            if no not in NOS_SEM_SUAVIZACAO:
                pontos = suavizar_agulha(pontos, NOS[no], posicao == -1)
        pontos = reamostrar(pontos, PASSO_SAIDA)
        d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pontos)
        print(f"// {segmento}\n'{d}'\n")


if __name__ == "__main__":
    gerar(sys.argv[1] if len(sys.argv) > 1 else "assets/xp-500.svg")
