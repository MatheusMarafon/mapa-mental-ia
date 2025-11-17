import React, { useState, useRef } from 'react';
import ReactFlow, { 
  MiniMap, 
  Controls, 
  Background, 
  Handle, 
  Position, 
  useNodesState,
  useEdgesState 
} from 'reactflow';
import 'reactflow/dist/style.css'; 
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Brain, Download, ArrowLeft, Lightbulb, FileText, Lock, Unlock } from 'lucide-react'; 

// --- (Prompt, cleanJsonString, animationVariants - Sem mudanças) ---
const getPrompt = (tema) => {
  return `Gere um mapa mental sobre o tema "${tema}".
Sua resposta deve ser **exclusivamente** um objeto JSON válido, sem nenhum texto antes ou depois.
O JSON deve ter duas chaves principais: "mapa" e "resumo".

1.  A chave "mapa" deve conter um objeto JSON com "nodes" e "edges":
    - "nodes": Um array de objetos. Cada objeto DEVE ter:
      - "id": (string)
      - "position": { "x": (number), "y": (number) } (distribua os nós de forma lógica)
      - "data": {
          "label": (string, o título do tópico),
          "descricao": (string, uma breve explicação de 1-2 frases sobre o tópico/label)
        }
    - "edges": (array de objetos com id, source, target)

2.  A chave "resumo" deve ser uma string contendo um resumo conciso e geral sobre o tema "${tema}" (máximo 3-4 frases).
`;
};

function cleanJsonString(text) {
  const cleanedText = text
    .replace(/^```json\s*/, '')
    .replace(/```$/, '');
  return cleanedText;
}

const animationVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

// --- (Componente MindMapNode - Sem mudanças) ---
const MindMapNode = ({ data }) => {
  const isMainNode = data.id === '1';
  return (
    <>
      {!isMainNode && (
        <Handle 
          type="target" 
          position={Position.Top} 
          className="!bg-gray-400"
        />
      )}
      <div 
        className={`
          p-4 rounded-xl shadow-lg border-2
          w-64 break-words
          ${isMainNode 
            ? 'bg-gradient-to-br from-blue-600 to-green-600 text-white border-blue-700' 
            : 'bg-white border-gray-200'}
        `}
      >
        <strong className={isMainNode ? 'text-lg' : 'text-base text-gray-900'}>
          {data.label}
        </strong>
        <hr className={`my-2 ${isMainNode ? 'border-blue-300/50' : 'border-gray-200'}`} />
        <p className={isMainNode ? 'text-blue-100 text-sm' : 'text-gray-600 text-sm'}>
          {data.descricao}
        </p>
      </div>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="!bg-gray-400"
      />
    </>
  );
};

const nodeTypes = { mindmap: MindMapNode };

// --- Começa o componente App ---
function App() {
  const [tema, setTema] = useState('');
  const [resumo, setResumo] = useState(''); 
  const [telaAtual, setTelaAtual] = useState('HOME');
  const mapRef = useRef(null);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [isLocked, setIsLocked] = useState(false);
  
  // --- (handleGerarMapa, handleVoltar - Sem mudanças) ---
  const handleGerarMapa = async () => {
    if (!tema) {
      alert("Por favor, digite um tema.");
      return;
    }
    setTelaAtual('LOADING');
    setNodes([]); 
    setEdges([]); 
    setResumo('');
    
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      alert("Chave de API do Gemini não encontrada! Verifique o arquivo .env.local");
      setTelaAtual('HOME');
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const prompt = getPrompt(tema);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let respostaJsonString = response.text();
      respostaJsonString = cleanJsonString(respostaJsonString);
      const dadosCompletos = JSON.parse(respostaJsonString);
      
      const processedNodes = dadosCompletos.mapa.nodes.map(n => ({
        ...n,
        type: 'mindmap',
        data: {
          ...n.data,
          id: n.id
        }
      }));

      const processedEdges = dadosCompletos.mapa.edges.map(e => ({
        ...e,
        animated: true,
        style: { stroke: '#6b7280', strokeWidth: 2 }
      }));

      setNodes(processedNodes);
      setEdges(processedEdges);
      setResumo(dadosCompletos.resumo || 'Não foi possível gerar um resumo.');

      setTelaAtual('RESULT');

    } catch (error) {
      console.error("Erro ao chamar a API do Gemini:", error);
      alert("Desculpe, ocorreu um erro ao gerar o mapa. (Verifique o console F12 e se sua chave de API é válida).");
      setTelaAtual('HOME');
    }
  };

  const handleVoltar = () => {
    setTema('');
    setNodes([]);
    setEdges([]);
    setResumo('');
    setTelaAtual('HOME');
  };

  const handleExportPDF = async () => {
    if (mapRef.current === null) {
      return;
    }
    // Des-seleciona os nós antes da foto
    document.querySelectorAll('.react-flow__node').forEach(n => n.blur());
    await new Promise(r => setTimeout(r, 50)); 

    document.body.style.cursor = 'wait';
    try {
      const dataUrl = await htmlToImage.toPng(mapRef.current, { cacheBust: true });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pdfWidth - (margin * 2);

      // --- PÁGINA 1: TÍTULO E MAPA ---
      pdf.setFont('Inter', 'bold');
      pdf.setFontSize(20);
      pdf.text(`Mapa Mental: ${tema}`, margin, 20);
      const imgProps = pdf.getImageProperties(dataUrl);
      const imgHeight = (imgProps.height * contentWidth) / imgProps.width;
      pdf.addImage(dataUrl, 'PNG', margin, 30, contentWidth, imgHeight);

      // --- PÁGINA 2: RESUMO E TÓPICOS ---
      pdf.addPage();
      
      // Adiciona o Resumo
      pdf.setFont('Inter', 'bold');
      pdf.setFontSize(16);
      pdf.text('Resumo do Tema', margin, 20);
      pdf.setFont('Inter', 'normal');
      pdf.setFontSize(12);
      const resumoLines = pdf.splitTextToSize(resumo, contentWidth);
      pdf.text(resumoLines, margin, 30);
      
      const resumoHeight = (resumoLines.length * 5) + 20;

      // Adiciona os Tópicos
      pdf.setFont('Inter', 'bold');
      pdf.setFontSize(16);
      pdf.text('Principais Tópicos', margin, resumoHeight);
      
      pdf.setFont('Inter', 'normal');
      pdf.setFontSize(12);
      
      const topicosText = nodes.map(node => {
        return `• ${node.data.label}\n   ${node.data.descricao || 'Sem descrição.'}`;
      }).join('\n\n'); 

      const topicosLines = pdf.splitTextToSize(topicosText, contentWidth);
      pdf.text(topicosLines, margin, resumoHeight + 10);
      
      pdf.save(`${tema || 'mapa-mental'}.pdf`);

    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      alert('Desculpe, ocorreu um erro ao exportar o PDF.');
    } finally {
      document.body.style.cursor = 'default';
    }
  };

  // --- O "return" (JSX) ---
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50 via-green-50 to-indigo-50 -z-10" />
      
      <div className="relative p-4 md:p-8">
        <AnimatePresence mode="wait">
          <div className="max-w-6xl mx-auto">

            {/* TELA 1: HOME (Sem mudanças) */}
            {telaAtual === 'HOME' && (
              <motion.div 
                key="home" 
                variants={animationVariants} 
                initial="initial" 
                animate="animate" 
                exit="exit" 
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", duration: 0.8, delay: 0.2 }}
                  className="relative mb-8 mt-12"
                >
                  <div className="relative bg-gradient-to-br from-blue-600 to-green-600 p-4 rounded-full shadow-lg">
                    <Brain className="w-10 h-10 text-white" />
                  </div>
                </motion.div>
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-5xl md:text-7xl font-black text-center mb-4 text-gray-900"
                >
                  Gerador de Mapa Mental IA
                </motion.h1>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex items-center gap-2 mb-3"
                >
                  <Lightbulb className="w-5 h-5 text-green-600" />
                  <p className="text-xl text-gray-700 font-medium">
                    Transforme ideias em estruturas visuais
                  </p>
                </motion.div>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-gray-500 text-center mb-12 max-w-md"
                >
                  Inteligência artificial para criar mapas mentais profissionais em segundos
                </motion.p>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="w-full max-w-2xl"
                >
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-green-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
                    <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
                      <div className="flex items-center">
                        <div className="pl-6 pr-4">
                          <Lightbulb className="w-6 h-6 text-blue-600" /> 
                        </div>
                        <input
                          type="text"
                          placeholder="Digite seu tema aqui... (ex: Guerra Fria, Marketing Digital)"
                          value={tema}
                          onChange={(e) => setTema(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleGerarMapa()}
                          className="flex-grow p-5 text-lg bg-transparent border-none outline-none placeholder-gray-400 text-gray-800"
                        />
                        <button
                          onClick={handleGerarMapa}
                          className="relative bg-gradient-to-r from-blue-600 to-green-600 text-white font-bold py-5 px-8 m-1.5 rounded-xl
                                     hover:from-blue-700 hover:to-green-700
                                     transform hover:scale-105 active:scale-95
                                     transition-all duration-200 ease-out
                                     shadow-lg hover:shadow-xl
                                     flex items-center gap-2 group"
                        >
                          <span>Gerar Mapa</span>
                          <Lightbulb className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-8">
                    {[
                      { icon: Brain, text: 'IA Avançada' },
                      { icon: Lightbulb, text: 'Gerador Rápido' },
                      { icon: Download, text: 'Exportar PDF' }
                    ].map((feature, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 + idx * 0.1 }}
                        className="bg-white/60 backdrop-blur-lg rounded-xl p-4 border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                      >
                        <feature.icon className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-gray-700 text-center">{feature.text}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* TELA 2: LOADING (Sem mudanças) */}
            {telaAtual === 'LOADING' && (
              <motion.div 
                key="loading" 
                className="flex flex-col items-center justify-center min-h-[80vh]"
                variants={animationVariants} 
                initial="initial" 
                animate="animate" 
                exit="exit" 
                transition={{ duration: 0.4 }}
              >
                <div className="relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 border-4 border-blue-200 rounded-full animate-ping opacity-20" />
                  </div>
                  <div className="relative w-24 h-24 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Brain className="w-10 h-10 text-blue-600 animate-pulse" />
                  </div>
                </div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-center mt-12"
                >
                  <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent mb-3">
                    Processando sua ideia...
                  </h2>
                  <p className="text-gray-600 text-lg">
                    A IA está estruturando seu mapa mental
                  </p>
                </motion.div>
              </motion.div>
            )}

            {/* TELA 3: RESULTADO */}
            {telaAtual === 'RESULT' && (
              <motion.div 
                key="result" 
                variants={animationVariants} 
                initial="initial" 
                animate="animate" 
                exit="exit" 
                transition={{ duration: 0.4 }}
                className="pb-8"
              >
                {/* Header (Sem mudanças) */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                  <div>
                    <h2 className="text-4xl font-bold text-gray-800 mb-2">
                      Seu Mapa Mental
                    </h2>
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-12 bg-gradient-to-r from-blue-600 to-green-600 rounded" />
                      <p className="text-xl text-gray-600">
                        Tema: <span className="font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">{tema}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleVoltar}
                    className="flex items-center gap-2 bg-white/80 backdrop-blur-lg text-gray-700 font-semibold py-3 px-6 rounded-xl
                               border border-gray-200 shadow-lg
                               hover:bg-white hover:shadow-xl hover:-translate-y-0.5
                               transform active:scale-95
                               transition-all duration-200"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Novo Mapa
                  </button>
                </div>

                {/* --- O CONTAINER DO MAPA (COM A CORREÇÃO) --- */}
                <div className="relative group mb-8">
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-green-600 rounded-3xl blur opacity-20 group-hover:opacity-30 transition duration-300" />
                  <div 
                    ref={mapRef} 
                    style={{ height: '600px' }} 
                    className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
                  >
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      nodeTypes={nodeTypes} 
                      fitView
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      
                      // --- NOSSAS PROPS DE TRAVA TOTAL ---
                      nodesDraggable={!isLocked}
                      nodesFocusable={!isLocked}
                      edgesFocusable={!isLocked}
                      panOnDrag={!isLocked}
                      zoomOnScroll={!isLocked}
                      zoomOnPinch={!isLocked}
                      zoomOnDoubleClick={!isLocked}
                      
                      // --- A LINHA DA CORREÇÃO ---
                      // Libera o scroll para a página quando travado
                      preventScrolling={!isLocked} 
                    >
                      <Controls showInteractive={false}> {/* Esconde o cadeado padrão */}
                        
                        {/* Nosso botão de trava customizado */}
                        <button 
                          onClick={() => setIsLocked(!isLocked)} 
                          className="react-flow__controls-button" 
                          title={isLocked ? "Desbloquear Mapa" : "Bloquear Mapa"}
                        >
                          {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>

                      </Controls>
                      <MiniMap 
                        nodeColor={(node) => '#2563eb'}
                        maskColor="rgba(37, 99, 235, 0.1)"
                      />
                      <Background variant="dots" gap={16} size={1} color="#e5e7eb" />
                    </ReactFlow>
                  </div>
                </div>
                
                {/* Card de Resumo (Sem mudanças) */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-6 bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-gradient-to-br from-blue-600 to-green-600 rounded-lg">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800">
                      Resumo do Tema
                    </h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed font-medium">
                    {resumo}
                  </p>
                </motion.div>

                {/* Grid de Cards (Tópicos e Exportação) (Sem mudanças) */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-gradient-to-br from-blue-600 to-green-600 rounded-lg">
                        <Brain className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-800">
                        Principais Tópicos
                      </h3>
                    </div>
                    <ul className="space-y-4"> 
                      {nodes.map((node, idx) => (
                        <motion.li 
                          key={node.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="flex items-start gap-3"
                        >
                          <div className="w-2 h-2 bg-gradient-to-br from-blue-600 to-green-600 rounded-full mt-2 flex-shrink-0" />
                          <div>
                            <span className="font-bold text-gray-800">{node.data.label}</span>
                            <p className="text-gray-600 text-sm">{node.data.descricao}</p>
                          </div>
                        </motion.li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-gradient-to-br from-blue-600 to-green-600 rounded-2xl shadow-xl border border-white/20 p-8 text-white">
                    <div className="flex items-center gap-3 mb-6">
                      <Download className="w-8 h-8" />
                      <h3 className="text-2xl font-bold">
                        Exportar Resultado
                      </h3>
                    </div>
                    <p className="text-blue-100 mb-6 leading-relaxed">
                      Baixe seu mapa mental completo, resumo e tópicos em um único arquivo PDF.
                    </p>
                    <button
                      onClick={handleExportPDF}
                      className="w-full bg-white text-blue-600 font-bold py-4 px-6 rounded-xl
                                 hover:bg-blue-50 hover:shadow-2xl hover:-translate-y-0.5
                                 transform active:scale-95
                                 transition-all duration-200
                                 flex items-center justify-center gap-2 group"
                    >
                      <Download className="w-5 h-5 group-hover:animate-bounce" />
                      <span>Exportar como PDF</span>
                    </button>
                    <div className="mt-6 pt-6 border-t border-white/20">
                      <div className="flex items-center justify-between text-sm text-blue-100">
                        <span>✓ Mapa visual</span>
                        <span>✓ Resumo do tema</span>
                        <span>✓ Tópicos detalhados</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default App;