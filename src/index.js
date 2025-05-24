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
              Resolva a questão apresentada a seguir utilizando a técnica de Self-Consistency da seguinte forma:

              1. Gere múltiplos caminhos de raciocínio plausíveis para resolver a questão, considerando diferentes abordagens válidas.
              2. Para cada caminho, explicite a dedução passo a passo até chegar a uma resposta final.
              3. Após gerar todos os caminhos de raciocínio, identifique qual resposta é mais consistente entre os diferentes caminhos gerados (i.e., a resposta mais recorrente entre eles).
              4. Justifique a resposta final escolhida com base na consistência entre os caminhos e refute outras possíveis respostas, se necessário.
              5. Caso nenhuma alternativa seja correta, ou se houver inconsistência significativa nos caminhos válidos, retorne a letra "I".
              6. Ao final, retorne no seguinte formato JSON:

              {\n "chatAnswer": "letra",\n "chatReasoning": "raciocínio completo"\n}

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
              I: Nenhuma das anteriores

              **Caminhos de raciocínio gerados:**
              1. Há dois triângulos pequenos lado a lado, e um triângulo grande envolvendo os dois. Total: 3 triângulos. → Resposta: B
              2. Contando os dois triângulos internos e o triângulo externo que os contém: 2 + 1 = 3 triângulos. → Resposta: B
              3. Um triângulo formado pela junção dos dois menores, mais os dois individuais: 3 triângulos. → Resposta: B
              4. Poderia parecer que são mais, mas visualmente distinguem-se 3 triângulos: dois internos e um externo. → Resposta: B

              **Resposta Final (por consistência):**
              A resposta mais consistente entre os caminhos gerados é a letra B.

              **Resposta em JSON:**
              {
                "chatAnswer": "b",
                "chatReasoning": "A maioria dos caminhos gerados concordam que existem dois triângulos internos e um triângulo externo, totalizando três triângulos. Portanto, a resposta mais consistente é a alternativa B."
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
