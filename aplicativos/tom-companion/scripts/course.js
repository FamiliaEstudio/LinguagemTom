'use strict';
// Authoring tool: reference snapshots are generated only when explicitly requested.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const {analyze}=require(path.join(root,'tom-lang/core/compiler'));
const directory=path.join(__dirname,'../courses/calculadora');
const reference=fs.readFileSync(path.join(directory,'referencia.tom'),'utf8');
const lines=reference.split('\n'),analysis=analyze(reference,{file:'referencia.tom'});
const functions={};
for(const fn of analysis.instructions.filter(n=>n.kind==='function')) {
  const end=analysis.instructions.find(n=>n.kind==='endFunction'&&n.opens===fn.id);
  functions[fn.name]=lines.slice(fn.location.line-1,end.location.line).join('\n');
}
const fullMain=lines.slice(486).join('\n');
const definitions=fullMain.slice(0,fullMain.indexOf('Enquantox@Executar'));
const resources=definitions.slice(0,definitions.indexOf('DefStk'));
const wait=`DefVarBlxAbertayVerdadeiro\nEnquantox@Aberta\nEventoAguardar[@Janela,@Evento]\nEventoCampo[@Evento,0]\nCompararDiferentexyInSd32x@ULTIMOy1\nSetVarBlxAbertay@ULTIMO\nFimEnquanto`;
const display="ChamarxDesenhar[@Janela,@Grande,@Pequena,@FonteVisor,@Entrada,@Mensagem]\n";
const chunks={},steps=[];
let main='';
function add(id,title,goal,why,write,check,code,{fn,checks=[],mainCode,detail}={}) {
  if(fn){chunks[fn]=code;main='';} if(mainCode!==undefined)main=mainCode;
  const solution=code||main;
  steps.push({id,title,goal,why,write,check,next:'',hints:[
    `Observe o que já existe: ${why}`,
    detail||`Leia os argumentos e o resultado de cada instrução. ${write} Guarde em uma variável o resultado que precisar usar depois de outra operação.`,
    `Solução comentada — compare com sua tentativa e faça a alteração no editor.\n// ${goal}\n${solution}`,
  ],solution,checks,functions:Object.keys(chunks),snapshot:Object.values(chunks).join('\n\n')+(main?'\n\n'+main:'')+'\n'});
}
const intro="DefVarDc34xAy0.1\nDefVarDc34xBy0.2\nSomarxyDc34x@Ay@B\nDefVarDc34xResultadoy@ULTIMO\nDefStkFB128CxSaidayl''\nDc34ParaTexto[@Resultado,@Saida]\nGerarTxtxSaida";
add('primeiro-resultado','Um cálculo que podemos conferir','Escreva 0.1 + 0.2, guarde o resultado e mostre 0.3.','Dc34 mantém a representação decimal. @ULTIMO é o resultado da soma; Resultado guarda esse valor para uso posterior.','Comece no arquivo vazio. Crie A, B e Resultado; converta o resultado em texto para imprimi-lo.','A saída deve ser exatamente 0.3.',intro,{mainCode:intro,checks:['intro']});
for(const [count,id,title] of [[1,'calcular-soma','Dar um nome ao cálculo'],[2,'calcular-subtracao','Escolher a subtração'],[3,'calcular-produto','Escolher a multiplicação'],[4,'calcular-divisao','Completar as quatro operações']]) {
  const body=functions.Calcular.split('\n');const code=[body[0],...body.slice(1,1+5*count),'Retornarx@B','FimFuncao'].join('\n');
  add(id,title,`Construa Calcular com ${count===1?'a soma':count+' operações'}.`,
    'Operador escolhe a conta; A e B chegam por valor. A comparação produz Bl, Se escolhe o caminho e Retornar entrega o resultado ao chamador.',
    count===1?'Substitua o experimento anterior pela função Calcular[InSd32xOperador,Dc34xA,Dc34xB]yDc34.':'Acrescente a condição correspondente antes de Retornarx@B.',
    `Os comandos 11 até ${10+count} devem calcular os resultados esperados; um comando desconhecido devolve B.`,code,
    {fn:'Calcular',checks:[`arithmetic:${count}`],detail:'Use os comandos 11 (somar), 12 (subtrair), 13 (multiplicar) e 14 (dividir). Cada caminho retorna seu resultado dentro do próprio bloco.'});
}
add('valor','Do visor para o número','Construa Valor para converter o texto em Dc34.','O visor pode terminar em ponto. Uma cópia local permite completar 12. para 12.0 sem alterar o texto recebido.','Acrescente Valor[TxtxEntrada]yDc34 depois de Calcular.','12., 0.1 e -3.5 são aceitos; texto inválido produz erro.',functions.Valor,{fn:'Valor',checks:['value']});
const digitPrefix=functions.Digitar.slice(0,functions.Digitar.indexOf('\nSenao\n'))+'\nFimSe\nFimFuncao';
add('digitar-inteiros','Montar o número no visor','Construa a entrada de dígitos em Digitar.','Entrada é um buffer emprestado mutável. Nova decide quando a digitação começa outro número; o zero inicial é removido antes de anexar o dígito.','Acrescente Digitar[RefFB128CxEntrada,InSd32xComando,BlxNova]yVazio.','Digitar 1 e 2 forma 12; Nova reinicia a entrada.',digitPrefix,{fn:'Digitar',checks:['digits']});
add('digitar-separador','Aceitar um único separador','Complete o caminho do separador em Digitar.','O laço percorre caracteres para não inserir dois pontos. Cada comparação substitui o último resultado booleano; Procurar é estado explícito do laço.','Acrescente Senao e a busca pelo ponto antes do fechamento de Digitar.','O comando 10 insere um ponto; um segundo separador é ignorado.',functions.Digitar,{fn:'Digitar',checks:['separator']});
add('sinal','Trocar o sinal','Construa Sinal para acrescentar ou remover o sinal negativo.','Uma cópia temporária preserva a entrada enquanto montamos o novo texto. O sinal é parte do texto até Valor fazer a conversão.','Acrescente Sinal[RefFB128CxEntrada]yVazio.','12 vira -12 e volta a 12.',functions.Sinal,{fn:'Sinal',checks:['sign']});
add('apagar','Apagar sem deixar o visor inválido','Construa Apagar.','Apagar o último caractere pode deixar o buffer vazio ou somente com um sinal; esses casos voltam a zero.','Acrescente Apagar[RefFB128CxEntrada,BlxNova]yVazio.','123 vira 12; apagar o último dígito ou um resultado reinicia em 0.',functions.Apagar,{fn:'Apagar',checks:['backspace']});
const commandDigits=functions.Comando.split('\n').slice(0,9).join('\n')+'\nRetornarx-1\nFimFuncao';
add('comando-digitos','Transformar caracteres em comandos','Comece Comando reconhecendo os dígitos.','O código do caractere 0 é 48. Subtrair 48 transforma o código de um dígito no número interno usado por Digitar.','Acrescente Comando[InSd32xCodigo]yInSd32.','48–57 retornam 0–9; caracteres desconhecidos retornam -1.',commandDigits,{fn:'Comando',checks:['command-digits']});
add('comando-operacoes','Reconhecer teclas e operadores','Complete Comando com separadores, operadores e comandos de edição.','Teclado e mouse chegam por caminhos diferentes, mas convergem nos mesmos números de comando. Ponto e vírgula têm a mesma função na entrada.','Amplie Comando seguindo a tabela de comandos da referência.','Verificar ponto, vírgula, +, -, ×, ÷, Enter, Escape, sinal e Backspace.',functions.Comando,{fn:'Comando',checks:['commands']});
add('janela','Abrir uma janela que pode fechar','Crie os recursos da calculadora e espere pelo fechamento.','Janela, fontes e evento têm duração lexical. Esperar um evento evita um laço que ocupe continuamente a CPU.','Depois das funções, crie Janela, Grande, Pequena, FonteVisor e Evento. Apresente um quadro e aguarde o fechamento.','A janela abre, apresenta um quadro e termina quando recebe fechar.',resources+"JanelaLimpar[@Janela,303570687]\nJanelaApresentar[@Janela]\n"+wait,{mainCode:resources+"JanelaLimpar[@Janela,303570687]\nJanelaApresentar[@Janela]\n"+wait,checks:['window']});
add('botao','Desenhar um botão reutilizável','Construa Botao e desenhe um botão de exemplo.','O retângulo estabelece a área visual. MedirTexto permite centralizar o rótulo sem adivinhar sua largura.','Insira Botao antes da criação dos recursos. A janela é emprestada com Ref porque será desenhada.',functions.Botao.includes('MedirTexto')?'Um retângulo e seu rótulo aparecem; a janela continua fechando normalmente.':'',functions.Botao,{fn:'Botao',checks:['button'],mainCode:resources+"JanelaLimpar[@Janela,303570687]\nChamarxBotao[@Janela,@Grande,l'C',24,216,102,847521791]\nJanelaApresentar[@Janela]\n"+wait});
add('desenhar','Montar o visor e a grade','Construa Desenhar usando Botao.','Desenhar lê o estado recebido e produz o quadro. Trocar ponto por vírgula altera somente a cópia destinada à apresentação.','Acrescente Desenhar com as fontes e os textos de entrada e mensagem. Depois crie os buffers do visor e chame a função.','Visor inicial 0, títulos, botões e símbolos aparecem nas posições da calculadora.',functions.Desenhar,{fn:'Desenhar',checks:['draw'],mainCode:resources+"DefStkFB128CxEntradayl'0'\nDefStkFB256CxMensagemyl''\n"+display+wait});
// Posicao is intentionally taught as one rectangle first, then the repeated grid.
const positionNodes=analysis.instructions.filter(n=>n.owner==='Posicao');
const outer=positionNodes.find(n=>n.kind==='if');
const outerEnd=positionNodes.find(n=>n.opens===outer.id);
const onePosition=lines.slice(positionNodes[0].location.line-1,outerEnd.location.line).join('\n')+'\nRetornarx-1\nFimFuncao';
add('posicao-primeiro','Relacionar desenho e clique','Comece Posicao reconhecendo o botão C.','Um botão ocupa um intervalo de x e y. O limite final é exclusivo para que um clique na borda não pertença a dois botões.','Acrescente Posicao[InSd32xX,InSd32xY]yInSd32. Confira os mesmos limites usados no desenho.','O interior de C retorna 17; fora dele retorna -1.',onePosition,{fn:'Posicao',checks:['position-first'],mainCode:resources+"DefStkFB128CxEntradayl'0'\nDefStkFB256CxMensagemyl''\n"+display+wait});
add('posicao-grade','Reconhecer todos os botões','Complete Posicao repetindo o teste de retângulos.','Cada retângulo devolve o mesmo comando que Comando produziria para a tecla equivalente. O botão igual ocupa duas colunas.','Amplie Posicao, comparando cada região com as chamadas a Botao em Desenhar.','Centros dos 19 botões, intervalos vazios e bordas são verificados.',functions.Posicao,{fn:'Posicao',checks:['positions'],mainCode:resources+"DefStkFB128CxEntradayl'0'\nDefStkFB256CxMensagemyl''\n"+display+wait});
add('estado','Guardar o que persiste entre eventos','Acrescente as variáveis de estado depois dos recursos.','Acumulador, Pendente, Nova e o histórico da última operação precisam existir durante todo o laço. @ULTIMO não substitui essa memória.','Substitua a inicialização provisória pelo estado completo da referência; mantenha a apresentação e a espera por fechar.','As declarações são verificadas e o visor inicial continua em 0.',definitions+display+wait,{mainCode:definitions+display+wait,checks:['state']});
function withoutBlock(source,needle) {
  const rows=source.split('\n'),a=analyze(source,{file:'main.tom'}),start=rows.findIndex(l=>l===needle);
  if(start<0)throw Error(needle);
  const opening=a.instructions.find(n=>n.kind==='if'&&n.location.line===start+2);
  const end=a.instructions.find(n=>n.opens===opening?.id);if(!end)throw Error('Block: '+needle);
  rows.splice(start,end.location.line-start);return rows.join('\n');
}
const uncaught=fullMain.replace(/^Tentar\n/m,'').replace(/^CapturarxErro\n[\s\S]*?^FimTentar\n/m,'');
let inputOnly=withoutBlock(uncaught,'CompararIgualxyInSd32x@Comandoy15');
// Remove the operator action's entire if while retaining the calculation of its condition.
inputOnly=withoutBlock(inputOnly,'ExyBlx@Operadory@ULTIMO');
add('eventos','Conectar entrada, estado e desenho','Substitua a espera provisória pelo laço que processa entrada e edição.','Texto digitado, teclas de controle e cliques convergem em Comando. Redesenhar limita a produção de quadros às mudanças observáveis.','Construa o laço principal, inicialmente com dígitos, separador, limpar, sinal e apagar.','Texto, teclado, mouse, redimensionamento e fechamento funcionam.',inputOnly,{mainCode:inputOnly,checks:['events']});
const basic=uncaught.replace(/Sex@TemUltimo\nChamarxCalcular\[@UltimoOperador,@Direito,@UltimoDireito\]\nSetVarDc34xAcumuladory@ULTIMO\nSenao\nSetVarDc34xAcumuladory@Direito\nFimSe/,'SetVarDc34xAcumuladory@Direito');
add('operacoes-sequenciais','Executar as contas na ordem digitada','Conecte operadores e igual ao acumulador.','Ao trocar de operação, a conta pendente é concluída antes de guardar a seguinte. Por isso 2 + 3 × 4 resulta em 20.','Acrescente os caminhos dos comandos 11–14 e 15 dentro do processamento.','0.1 + 0.2 dá 0,3; 2 + 3 × 4 dá 20.',basic,{mainCode:basic,checks:['sequential']});
add('repetir-igual','Lembrar a última operação','Complete o caminho que repete igual.','UltimoOperador e UltimoDireito são variáveis persistentes da calculadora. Seus nomes não têm o comportamento especial de @ULTIMO.','No comando igual sem operação pendente, use TemUltimo para decidir se reaplica a conta.','2 + 3 = = dá 8; uma nova entrada encerra a repetição anterior.',uncaught,{mainCode:uncaught,checks:['repeat']});
add('recuperacao','Continuar depois de uma conta inválida','Envolva o processamento em Tentar/Capturar e restaure o estado após erro.','Dividir por zero não precisa fechar a janela. A mensagem explica a falha; limpar ou digitar outro número inicia uma tentativa consistente.','Acrescente Tentar, CapturarxErro e o tratamento da referência. Confira as variáveis usadas para reiniciar.','Os 38 cenários da calculadora passam, incluindo erros e recuperação.',fullMain,{mainCode:fullMain,checks:['complete']});
steps.forEach((s,i)=>s.next=steps[i+1]?.goal||'Verifique a calculadora completa, execute a janela e gere seu pacote.');
function generate(){
  if(!analysis.success)throw Error('Invalid reference');
  const manifest={explanations:JSON.parse(fs.readFileSync(path.join(directory,'explicacoes.json'),'utf8')),id:'calculadora',version:1,title:'Construir e compreender a calculadora',reference:{version:'Tom 0.4 / calculadora 0.2',sha256:createHash('sha256').update(reference).digest('hex'),file:'referencia.tom'},steps:steps.map(({snapshot,...s})=>s)};
  fs.writeFileSync(path.join(directory,'roteiro.json'),JSON.stringify(manifest,null,2)+'\n');
  steps.forEach((s,i)=>fs.writeFileSync(path.join(directory,'steps',String(i).padStart(2,'0')+'.tom'),s.snapshot));
  console.log(`${steps.length} passos; ${analysis.instructions.length} instruções de referência.`);
}
if(require.main===module)generate();
module.exports={steps,functions,reference};
