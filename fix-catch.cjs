const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

function processFile(filePath) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
    const originalCode = fs.readFileSync(filePath, 'utf8');
    let code = originalCode;

    // Pattern 1: catch (err: any) -> catch (errUnknown: unknown) and err.message -> errUnknown.message
    // We can just use a simple regex replace if it's very consistent, but a robust way is:
    code = code.replace(/catch\s*\(\s*(err|error|e)\s*(:\s*any)?\s*\)\s*\{/g, (match, paramName) => {
        return `catch (errUnknown: unknown) {\n      const ${paramName} = errUnknown instanceof Error ? errUnknown : new Error(String(errUnknown) || "Ocurrió un error inesperado.");`;
    });

    // Pattern 2: catch (err) -> catch (errUnknown: unknown)
    // Covered by the regex above because `(: any)?` is optional.

    if (code !== originalCode) {
        fs.writeFileSync(filePath, code, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

walkDir(path.join(__dirname, 'src'), processFile);
console.log('Catch blocks refactoring complete.');
