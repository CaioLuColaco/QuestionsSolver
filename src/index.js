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
              Resolva a questão apresentada a seguir da seguinte forma:
              1. Descreva com clareza os elementos relevantes observados nas imagens.
              2. Desenvolva um raciocínio passo a passo, explicitando cada dedução até chegar à resposta correta.
              3. Justifique a alternativa escolhida com base no enunciado e nas imagens, e refute as demais.
              4. Caso nenhuma alternativa seja correta, responda com a letra "I".
              5. Ao final, retorne a resposta no seguinte formato JSON:
              {
                "chatAnswer": "letra",
                "chatReasoning": "raciocínio completo"
              }

              ---

              ### Exemplo
              **Questão 0:**
              Quantos triângulos estão presentes na imagem?

              **Imagem:** mostra uma figura composta por dois triângulos pequenos dentro de um triângulo maior.

              **Alternativas:**
              A: 2  
              B: 3  
              C: 4  
              D: 5
              I: Caso idenifique que nenhuma alternativa é correta, ou que a questão possui erros de lógica ou elaboração.

              **Resolução passo a passo:**
              1. A imagem contém dois triângulos pequenos desenhados lado a lado.
              2. Eles estão posicionados dentro de um triângulo maior que os envolve.
              3. Portanto, temos 2 triângulos pequenos + 1 grande formado por eles = 3 triângulos.
              4. A alternativa correta é a letra B.

              **Resposta em JSON:**
              {
                "chatAnswer": "b",
                "chatReasoning": "A imagem contém dois triângulos pequenos e um triângulo maior formado pela junção deles, totalizando três triângulos. Por isso, a alternativa B é a correta."
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

    if (content.startsWith('```')) {
      content = content.replace(/```(?:json)?\n?/g, '').replace(/```$/, '').trim();
    }

    return JSON.parse(content);
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

index();
