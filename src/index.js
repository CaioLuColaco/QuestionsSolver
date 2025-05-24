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

              **Questão ${question.question}:**
              ${question.text}

              **Alternativas:**
              ${formattedOptions}

              **Imagens:**

              Siga as instruções:

              1. Resolva a questão.
              Se nenhuma alternativa for correta, use a letra "I".

              Retorne no seguinte formato JSON:

              {\n "chatAnswer": "letra",\n "chatReasoning": "raciocínio completo"\n}
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
