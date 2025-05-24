import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI();

const index = async () => {
  const testDirPath = './Enade 2021 ADS';
  const testFilePath = './Enade 2021 ADS/questions.json';
  const outputPath = './results.json';

  const allQuestions = await getAllQuestions(testFilePath);
  const validQuestions = allQuestions.filter((q) => q.necessImage && q.tecnicalQuestion);
  const results = [];

  for (const question of validQuestions) {
    const base64Images = await loadBase64Images(question.images, testDirPath);
    const structuredOutput = await sendQuestionToOpenAI(question, base64Images);

    if (structuredOutput) {
      const attempt = {
        chatAnswer: structuredOutput.chatAnswer.toLowerCase(),
        correctAnswer: question.answer.toLowerCase(),
        chatReasoning: structuredOutput.chatReasoning,
      };

      results.push({
        questionNumber: question.question,
        ...attempt,
      });

      const originalQuestion = allQuestions.find((q) => q.question === question.question);
      if (originalQuestion) {
        originalQuestion.attempts = originalQuestion.attempts || [];
        originalQuestion.attempts.push(attempt);
      }
    } else {
      console.warn(`❗ Questão ${question.question} falhou e será ignorada.`);
    }
  }

  await saveResults(outputPath, results);
  await saveUpdatedQuestions(testFilePath, allQuestions);
  console.log(`✅ Resultados salvos em ${outputPath}`);
  console.log(`✅ Questões atualizadas com tentativas salvas em ${testFilePath}`);
};

async function getAllQuestions(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao processar o arquivo de questões:', error);
    return [];
  }
}

async function loadBase64Images(imagePaths, testDirPath) {
  const promises = imagePaths.map(async (imagePath) => {
    try {
      const resolvedPath = path.resolve(path.join(testDirPath, imagePath));
      const base64 = await fs.readFile(resolvedPath, 'base64');
      const mimeType = resolvedPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `data:${mimeType};base64,${base64}`;
    } catch (err) {
      console.error('Erro ao carregar imagem:', imagePath, err);
      return null;
    }
  });

  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

async function sendQuestionToOpenAI(question, base64Images) {
  try {
    const formattedOptions = Object.entries(question.options)
      .map(([key, value]) => `${key.toUpperCase()}: ${value}`)
      .join('\n');

    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `
              Você é um especialista em resolução de questões visuais e técnicas com imagens.

              ---

              ### Instruções
              Resolva a questão apresentada a seguir utilizando a técnica Tree of Thoughts da seguinte forma:

              1. Decomponha o problema em uma sequência de pensamentos (steps) intermediários. Cada "thought" é uma etapa lógica clara e significativa no processo de solução.
              2. Em cada estado, gere múltiplas opções de pensamento possíveis para avançar na solução (branching).
              3. Avalie cada pensamento candidato com base em critérios de progresso rumo à solução final. Use raciocínio deliberado para determinar qual pensamento seguir (pode usar votos, pontuações ou classificações).
              4. Continue explorando os caminhos mais promissores utilizando uma estratégia de busca (ex: busca em largura - BFS ou busca em profundidade - DFS). Considere retroceder se necessário (backtracking).
              5. Ao atingir um estado final (uma solução completa), pare a busca e apresente a resposta final.
              6. Caso nenhum caminho leve a uma resposta válida ou se todas as alternativas forem incorretas, retorne a letra "I".
              7. Ao final, retorne no seguinte formato JSON:

              {\n "chatAnswer": "letra",\n "chatReasoning": "raciocínio completo"\n}

              ---

              ### Exemplo
              **Questão 0:**
              Quantos triângulos estão presentes na imagem?

              **Imagem:** mostra dois triângulos pequenos dentro de um triângulo maior.

              **Alternativas:**
              A: 2  
              B: 3  
              C: 4  
              D: 5  
              I: Nenhuma das anteriores

              **Etapas de raciocínio como árvore:**
              1. Estado inicial: imagem com formas geométricas.
              2. Geração de pensamentos:
                - T1: Contar apenas os dois triângulos pequenos → Total: 2 → A
                - T2: Contar os dois pequenos + o triângulo maior → Total: 3 → B
                - T3: Considerar a sobreposição e sub-regiões → Possível confusão, mas não há subdivisão extra visível
              3. Avaliação dos pensamentos:
                - T1: Parcialmente correto, mas ignora figura maior.
                - T2: Coerente com a estrutura da imagem.
                - T3: Suposições não sustentadas pela imagem.
              4. Escolha final por heurística/voto: T2 é o pensamento mais promissor.

              **Resposta em JSON:**
              {
                "chatAnswer": "b",
                "chatReasoning": "Após explorar diferentes caminhos de raciocínio, o pensamento que considera os dois triângulos pequenos e o triângulo maior foi avaliado como mais consistente com a imagem. Assim, a resposta correta é B."
              }

              ---

              Agora, resolva a seguinte questão real:

              **Questão ${question.question}:**
              ${question.text}

              **Alternativas:**
              ${formattedOptions}

              **Imagens:**
              `.trim()
            },
          ...base64Images.map((image) => ({
            type: 'image_url',
            image_url: { url: image },
          })),
        ],
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
    });

    let content = response.choices[0].message.content.trim();

    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    const jsonString = content.slice(jsonStart, jsonEnd + 1);

    return JSON.parse(jsonString);
  } catch (error) {
    console.error(`Erro na questão ${question.question}:`, error.message);
    return null;
  }
}

async function saveResults(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Erro ao salvar resultados:', error);
  }
}

async function saveUpdatedQuestions(filePath, updatedQuestions) {
  try {
    await fs.writeFile(filePath, JSON.stringify(updatedQuestions, null, 2), 'utf-8');
  } catch (error) {
    console.error('Erro ao salvar questões atualizadas:', error);
  }
}

const orchestrator = async () => {
  const contador = 10

  for (let i = 0; i < contador; i++) {
    console.log("Iniciando rodagem " + (i + 1) + " de " + contador);
    await index();
  }
}

orchestrator();