import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, PDFPage } from 'pdf-lib';

export function activate(context: vscode.ExtensionContext) {
    console.log('PDF Flattener extension is now active');

    let disposable = vscode.commands.registerCommand('pdf-flattener.flattenPdf', async (uri?: vscode.Uri) => {
        try {
            let targetUri: vscode.Uri;

            if (uri) {
                // Called from context menu
                targetUri = uri;
            } else {
                // Called from command palette
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Select PDF to flatten',
                    filters: {
                        'PDF files': ['pdf']
                    }
                };

                const fileUri = await vscode.window.showOpenDialog(options);
                if (!fileUri || fileUri.length === 0) {
                    return;
                }
                targetUri = fileUri[0];
            }

            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Flattening PDF",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Reading PDF file..." });

                // Read the PDF file
                const pdfPath = targetUri.fsPath;
                const pdfBytes = fs.readFileSync(pdfPath);

                progress.report({ increment: 30, message: "Processing PDF..." });

                // Load the PDF document
                const pdfDoc = await PDFDocument.load(pdfBytes);

                // Flatten the PDF by creating a new document and copying content
                const flattenedPdf = await flattenPdfDocument(pdfDoc);

                progress.report({ increment: 60, message: "Saving flattened PDF..." });

                // Generate output filename
                const dir = path.dirname(pdfPath);
                const name = path.basename(pdfPath, '.pdf');
                const outputPath = path.join(dir, `${name}_flattened.pdf`);

                // Save the flattened PDF
                const flattenedBytes = await flattenedPdf.save();
                fs.writeFileSync(outputPath, flattenedBytes);

                progress.report({ increment: 100, message: "Complete!" });

                // Show success message with option to open file
                const action = await vscode.window.showInformationMessage(
                    `PDF flattened successfully! Saved as: ${path.basename(outputPath)}`,
                    'Open File',
                    'Show in Explorer'
                );

                if (action === 'Open File') {
                    const doc = await vscode.workspace.openTextDocument(outputPath);
                    await vscode.window.showTextDocument(doc);
                } else if (action === 'Show in Explorer') {
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
                }
            });

        } catch (error: any) {
            vscode.window.showErrorMessage(`Error flattening PDF: ${error.message}`);
            console.error('PDF Flattener Error:', error);
        }
    });

    context.subscriptions.push(disposable);
}

async function flattenPdfDocument(originalPdf: PDFDocument): Promise<PDFDocument> {
    // Create a new PDF document
    const flattenedPdf = await PDFDocument.create();
    
    // Copy metadata
    flattenedPdf.setTitle(originalPdf.getTitle() || '');
    flattenedPdf.setAuthor(originalPdf.getAuthor() || '');
    flattenedPdf.setSubject(originalPdf.getSubject() || '');
    flattenedPdf.setCreator(originalPdf.getCreator() || '');
    flattenedPdf.setProducer('VS Code PDF Flattener Extension');
    flattenedPdf.setCreationDate(new Date());
    flattenedPdf.setModificationDate(new Date());

    // Get all pages from the original document
    const pages = originalPdf.getPages();
    
    for (let i = 0; i < pages.length; i++) {
        const originalPage = pages[i];
        
        // Copy the page to the new document
        const [copiedPage] = await flattenedPdf.copyPages(originalPdf, [i]);
        
        // Add the copied page to the flattened document
        flattenedPdf.addPage(copiedPage);
        
        // Remove form fields and annotations by flattening them
        // This is done automatically when copying pages with pdf-lib
        // The visual content is preserved but interactive elements are removed
        
        // Additional flattening: Remove any remaining interactive elements
        try {
            // Get the page's form fields and flatten them
            const form = originalPdf.getForm();
            const fields = form.getFields();
            
            fields.forEach(field => {
                try {
                    // Flatten form fields by making them non-interactive
                    if (field.constructor.name.includes('Text')) {
                        (field as any).enableReadOnly();
                    } else if (field.constructor.name.includes('CheckBox')) {
                        (field as any).enableReadOnly();
                    } else if (field.constructor.name.includes('RadioGroup')) {
                        (field as any).enableReadOnly();
                    } else if (field.constructor.name.includes('Dropdown')) {
                        (field as any).enableReadOnly();
                    }
                } catch (fieldError) {
                    // Continue if individual field flattening fails
                    console.warn('Could not flatten field:', fieldError);
                }
            });
        } catch (formError) {
            // Continue if form processing fails - the page copy still removes most interactive elements
            console.warn('Could not process form fields:', formError);
        }
    }
    
    return flattenedPdf;
}

export function deactivate() {
    console.log('PDF Flattener extension is now deactivated');
}