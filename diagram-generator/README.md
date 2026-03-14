# Study Guide Diagram Generator

A web application that transforms study guides and informational text into visual diagrams with icons and hierarchical structure. Simply paste your text with headings and subheadings to generate detailed visual representations.

## Features

- 📝 **Text Input**: Paste any study guide or informational text with headings
- 🎨 **Multiple Diagram Types**: Choose from hierarchical diagrams, flowcharts, mind maps, concept graphs, or sequence diagrams
- 🏗️ **Heading Detection**: Automatically recognizes markdown headings (# ## ###), numbered lists (1., 2., A., B.), and creates hierarchical structures
- 🎯 **Visual Icons**: Automatically adds relevant emoji icons to concepts based on keywords
- 🤖 **Smart Analysis**: Extracts concepts, relationships, and structure from your text
- 💾 **Export**: Download diagrams as SVG files
- 🎯 **Modern UI**: Clean, responsive interface with formatting preservation

## How to Use

### Option 1: Open Directly in Browser

1. Navigate to the `diagram-generator` folder
2. Double-click `index.html` to open in your browser
3. Paste your study guide text (with headings/subheadings for best results)
4. Select a diagram type (start with "Hierarchical (with Headings)")
5. Click "Generate Diagram"

### Option 2: Using a Local Server

1. In Terminal, navigate to the project folder:
   ```bash
   cd /path/to/claude
   python3 -m http.server 8000
   ```

2. Open your browser and go to:
   ```
   http://localhost:8000/diagram-generator/
   ```

## Config file for API key (optional)

To use your OpenAI API key from a file instead of typing it in the app:

1. **Copy the example config**
   ```bash
   cd diagram-generator
   cp config.example.js config.local.js
   ```

2. **Edit `config.local.js`** and set your key:
   ```js
   window.OPENAI_API_KEY = 'sk-proj-your-actual-key-here';
   ```

3. **Save the file.** The app will use this key when you choose "Visual with Drawings". The status under the key field will show "Key detected (from config)".

**Important:** `config.local.js` is listed in `.gitignore`, so it is never committed to git. Only `config.example.js` (no real key) is in the repo. Never commit a file that contains your real API key.

## Supported Heading Formats

The app recognizes multiple heading formats:

### Markdown Headings
```
# Main Heading
## Subheading
### Sub-subheading
```

### Numbered Lists
```
1. Main Section
   1.1 Subsection
   1.2 Another Subsection
2. Second Section
```

### Letter Lists
```
A. Main Section
   a. Subsection
B. Second Section
```

### Roman Numerals
```
I. Main Section
II. Second Section
```

## Example Text

Try pasting this structured example:

```
# Photosynthesis

## Overview
Photosynthesis is the process by which plants convert light energy into chemical energy.

## Main Stages

### Light-Dependent Reactions
Take place in the thylakoid membranes and produce ATP and NADPH. These reactions use chlorophyll to capture light energy.

### Calvin Cycle
Occurs in the stroma and uses ATP and NADPH to fix carbon dioxide into glucose. This is also known as the light-independent reactions.

## Key Components

### Chlorophyll
The green pigment that captures light energy.

### Thylakoids
Membrane structures where light-dependent reactions occur.
```

## Do I need something to generate pictures?

**No.** The app uses **real photos** in two ways:

1. **Default (no signup)** – **Picsum Photos** ([picsum.photos](https://picsum.photos)): each node gets a consistent stock photo (same concept = same image). No API key or account needed.
2. **Optional (topic-matched images)** – **Unsplash**: if you add a free [Unsplash API key](https://unsplash.com/developers), the app fetches photos that match your topic (e.g. “Photosynthesis” → plant/leaf photos). Free tier is enough for personal use.

Open **Image settings (optional)** under the controls to add an Unsplash Access Key.

## Diagram Types

- **Visual with Drawings**: Diagram made of **illustration cards** (AI-generated drawings) for each heading/concept. Drawings are created based on your study guide content, so they accurately represent what you're studying (e.g., chloroplast illustrations for chloroplast concepts).
- **Hierarchical (with Headings)**: Shows the complete structure with headings, subheadings, and concepts in a tree format with icons
- **Flowchart**: Shows processes and relationships in a top-down flow with visual icons
- **Mind Map**: Hierarchical visualization centered around a main topic with branches
- **Concept Graph**: Network diagram showing relationships between concepts
- **Sequence Diagram**: Shows interactions and processes over time

## Visual Icons

The app automatically adds relevant icons based on keywords:
- 🌱 Science & Biology (photosynthesis, plant, cell, DNA)
- ⚙️ Processes & Systems (process, cycle, mechanism)
- 💡 Learning & Study (concept, idea, theory)
- 💻 Technology (computer, software, algorithm)
- And many more!

## Tips for Best Results

1. **Use headings**: Structure your text with headings (# ## ###) or numbered lists for best results
2. **Preserve formatting**: The textarea preserves line breaks and formatting when you paste
3. **Include key terms**: Capitalized terms and important concepts are automatically detected
4. **Describe relationships**: Use words like "contains", "leads to", "uses", "occurs in" to help identify connections
5. **Try different types**: Start with "Hierarchical" to see the full structure, then try other types
6. **Copy-paste friendly**: You can copy formatted text from documents, markdown files, or study guides and paste directly

## Keyboard Shortcuts

- `Ctrl/Cmd + Enter`: Generate diagram (when text input is focused)

## Technical Details

- Built with vanilla JavaScript (no frameworks required)
- Uses [Mermaid.js](https://mermaid.js.org/) for diagram rendering
- Client-side text analysis (no server required)
- Works offline after initial page load
- Preserves text formatting (line breaks, spacing) when pasting

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari

## Example Use Cases

- **Study Guides**: Convert structured study materials into visual diagrams
- **Lecture Notes**: Transform notes with headings into hierarchical diagrams
- **Textbooks**: Extract key concepts and relationships from textbook sections
- **Research Papers**: Visualize the structure and concepts from academic papers
- **Documentation**: Create visual representations of technical documentation

## Future Enhancements

Potential improvements:
- Integration with AI APIs for better text analysis and image generation
- More diagram types (ER diagrams, Gantt charts, etc.)
- Custom styling options
- Export to PNG/PDF formats
- Save/load diagram configurations
- Image upload support for adding custom icons
