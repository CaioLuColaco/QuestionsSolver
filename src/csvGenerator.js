import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function convertJsonToCsv(jsonData, outputPath) {
    const questionsWithAttempts = jsonData.filter(q => q.attempts && q.attempts.length > 0);

    if (questionsWithAttempts.length === 0) {
        console.log("Nenhuma questão com tentativas (attempts) encontrada. Nenhum arquivo CSV será gerado.");
        return;
    }

    const maxAttempts = 10;

    let csvHeader = "Número da Questão,Técnica de Prompt,Resposta Correta";
    for (let i = 1; i <= maxAttempts; i++) {
        csvHeader += `,Resposta ${i}`;
    }
    csvHeader += '\n';

    let csvRows = questionsWithAttempts.map(question => {
        const row = [
            question.question,
            "Visualization-of-Thoughts",
            `"${String(question.answer).replace(/"/g, '""')}"`,
        ];

        for (let i = 0; i < maxAttempts; i++) {
            if (question.attempts[i] && question.attempts[i].chatAnswer !== undefined) {
                row.push(`"${String(question.attempts[i].chatAnswer).replace(/"/g, '""')}"`);
            } else {
                row.push('');
            }
        }
        return row.join(',');
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    try {
        await fs.writeFile(outputPath, csvContent, 'utf8');
        console.log(`Arquivo CSV gerado com sucesso em: ${outputPath}`);
    } catch (err) {
        console.error("Erro ao escrever o arquivo CSV:", err);
    }
}

async function main() {
    const inputFilePath = path.join(__dirname, '../Enade 2021 ADS/questions.json');
    const outputCsvPath = path.join(__dirname, 'relatorio_tentativas.csv');

    try {
        const data = await fs.readFile(inputFilePath, 'utf8');
        const jsonData = JSON.parse(data);

        if (!Array.isArray(jsonData)) {
            console.error("Erro: O conteúdo do arquivo JSON não é um array. Verifique o formato do seu JSON.");
            return;
        }
        await convertJsonToCsv(jsonData, outputCsvPath);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`Erro: Arquivo JSON não encontrado em "${inputFilePath}". Verifique o nome e o caminho do arquivo.`);
        } else if (err instanceof SyntaxError) {
            console.error("Erro ao parsear o JSON. Verifique se o formato do arquivo está correto:", err);
        }
        else {
            console.error("Erro ao processar o arquivo:", err);
        }
    }
}

main();