




// Nouns (things , titles, concepts, places, people)

const nouns = [
    "Ability",
    "Account",
    "Achievement",
    "Application",
    "Assessment",
    "Benefit",
    "Candidate",
    "Career",
    "Certification",
    "Challenge",
    "Client",
    "Communication",
    "Company",
    "Compensation",
    "Contract",
    "Culture",
    "Deadline",
    "Degree",
    "Department",
    "Description",
    "Development",
    "Education",
    "Employer",
    "Employment",
    "Environment",
    "Experience",
    "Goal",
    "Interview",
    "Job",
    "Location",
    "Manager",
    "Mistake",
    "Opportunity",
    "Organization",
    "Pay",
    "Position",
    "Posting",
    "Problem",
    "Project",
    "Qualification",
    "Reference",
    "Requirement",
    "Responsibility",
    "Resume",
    "Role",
    "Salary",
    "Schedule",
    "Skill",
    "Staff",
    "Strength",
    "Task",
    "Team",
    "Technology",
    "Training",
    "Weakness",
    "Work"
];


// Verbs (actions, occurrences, states of being)
const verbs = [
    "Achieve",
    "Adapt",
    "Analyze",
    "Apply",
    "Assist",
    "Build",
    "Collaborate",
    "Communicate",
    "Complete",
    "Coordinate",
    "Create",
    "Deliver",
    "Demonstrate",
    "Develop",
    "Earn",
    "Execute",
    "Explain",
    "Facilitate",
    "Handle",
    "Implement",
    "Improve",
    "Lead",
    "Learn",
    "Manage",
    "Organize",
    "Oversee",
    "Perform",
    "Plan",
    "Prioritize",
    "Provide",
    "Recruit",
    "Report",
    "Research",
    "Resolve",
    "Respond",
    "Review",
    "Support",
    "Train",
    "Troubleshoot",
    "Utilize",
    "Work"
];

// propernouns (specific names of people, places, or organizations)

const propernouns = [
    "Adobe",
    "Amazon",
    "Apple",
    "Bachelor’s Degree",
    "Google",
    "Indeed",
    "Java",
    "LinkedIn",
    "Microsoft",
    "MongoDB",
    "Oracle",
    "Python",
    "Salesforce",
    "SQL",
    "Tableau",
    "Twitter (X)",
    "United States",
    "Visa",
    "Zoom"
];

// subjects (topics, themes, or areas of interest)
const subjects = [
    "Applicant",
    "Candidate",
    "Client",
    "Employee",
    "Employer",
    "Graduate",
    "Hiring Manager",
    "Individual",
    "Intern",
    "Job Seeker",
    "Manager",
    "Professional",
    "Recruiter",
    "Student",
    "Supervisor",
    "Team Member",
    "Worker"
];

const userShortResponce = [
    "Agree",
    "Answer",
    "Approve",
    "Complete",
    "Confirm",
    "Decline",
    "Deny",
    "Enter",
    "Finish",
    "Mark",
    "Select",
    "Submit",
    "Toggle",
    "Yes",
    "No"
];

const actionWorkds = [
    "Checked",
    "Chosen",
    "Completed",
    "Filled",
    "Ignored",
    "Opted",
    "Selected",
    "Started",
    "Submitted",
    "Updated"
];

// Function to normalize text for better matching
function normalizeText(text) {
    return text.toLowerCase()
               .replace(/[.,!?;:]/g, '')  // Remove punctuation
               .replace(/\s+/g, ' ')      // Normalize whitespace
               .trim();
}

/**
 * Multi-Modal Weighted Semantic Similarity Algorithm
 * 
 * Formula: S(Q,A) = Σ(Wi × Mi) + B(Q,A) + C(Q)
 * 
 * Where:
 * - S(Q,A) = Similarity score between Question Q and Answer A
 * - Wi = Weight for linguistic category i
 * - Mi = |category_i(Q) ∩ category_i(A)| (intersection cardinality)
 * - B(Q,A) = Σ(15 × δ(proper_noun_i, Q, A)) (exact phrase bonuses)
 * - C(Q) = ⌊confidence(Q) × 10⌋ (category coherence bonus)
 * 
 * Weights: W₁=12(ProperNouns), W₂=6(Nouns), W₃=4(Verbs), W₄=3(Subjects), 
 *          W₅=8(ShortResponse), W₆=5(Actions), W₇=1(Direct)
 * 
 * Time Complexity: O(|Q| × |A| × |W|)
 * Space Complexity: O(|Q| + |A| + |W|)
 */
function calculateScore(qustion, answer, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds) {
    // turns qustions into array of words
    const qustionWords = normalizeText(qustion).split(" ");
    const answerWords = normalizeText(answer).split(" ");

    // Extract word types for question
    const qustionNouns = qustionWords.filter(word => nouns.map(n => n.toLowerCase()).includes(word));
    const qustionVerbs = qustionWords.filter(word => verbs.map(v => v.toLowerCase()).includes(word));
    const qustionProperNouns = qustionWords.filter(word => propernouns.map(p => p.toLowerCase()).includes(word));
    const qustionSubjects = qustionWords.filter(word => subjects.map(s => s.toLowerCase()).includes(word));
    const qustionShortResponse = qustionWords.filter(word => userShortResponce.map(r => r.toLowerCase()).includes(word));
    const qustionActions = qustionWords.filter(word => actionWorkds.map(a => a.toLowerCase()).includes(word));

    // Extract word types for answer
    const answerNouns = answerWords.filter(word => nouns.map(n => n.toLowerCase()).includes(word));
    const answerVerbs = answerWords.filter(word => verbs.map(v => v.toLowerCase()).includes(word));
    const answerProperNouns = answerWords.filter(word => propernouns.map(p => p.toLowerCase()).includes(word));
    const answerSubjects = answerWords.filter(word => subjects.map(s => s.toLowerCase()).includes(word));
    const answerShortResponse = answerWords.filter(word => userShortResponce.map(r => r.toLowerCase()).includes(word));
    const answerActions = answerWords.filter(word => actionWorkds.map(a => a.toLowerCase()).includes(word));

    // Initialize score
    let score = 0;
    
    // Dynamic category detection for better scoring
    const questionCategory = detectQuestionCategory(qustion, propernouns, nouns, verbs);
    
    // Weighted scoring based on linguistic feature matching
    // Formula component: Σ(Wi × |categoryi(Q) ∩ categoryi(A)|)
    
    const properNounMatches = qustionProperNouns.filter(word => answerProperNouns.includes(word));
    score += properNounMatches.length * 12;  // W₁ = 12 (highest semantic value)
    
    const nounMatches = qustionNouns.filter(word => answerNouns.includes(word));
    score += nounMatches.length * 6;  // W₂ = 6 (high concept matching)
    
    const verbMatches = qustionVerbs.filter(word => answerVerbs.includes(word));
    score += verbMatches.length * 4;  // W₃ = 4 (action alignment)
    
    const subjectMatches = qustionSubjects.filter(word => answerSubjects.includes(word));
    score += subjectMatches.length * 3;  // W₄ = 3 (entity recognition)
    
    const shortResponseMatches = qustionShortResponse.filter(word => answerShortResponse.includes(word));
    score += shortResponseMatches.length * 8;  // W₅ = 8 (intent matching)
    
    const actionMatches = qustionActions.filter(word => answerActions.includes(word));
    score += actionMatches.length * 5;  // W₆ = 5 (status understanding)
    
    const directMatches = qustionWords.filter(word => answerWords.includes(word));
    score += directMatches.length * 1;  // W₇ = 1 (fallback similarity)
    
    // Bonus scoring: B(Q,A) = Σ(15 × δ(pi, Q, A))
    const lowerQuestion = qustion.toLowerCase();
    const lowerAnswer = answer.toLowerCase();
    
    // Exact phrase matching bonus (δ function: 1 if phrase exists in both, 0 otherwise)
    propernouns.forEach(prop => {
        const propLower = prop.toLowerCase();
        if (lowerQuestion.includes(propLower) && lowerAnswer.includes(propLower)) {
            score += 15; // Technology/certification exact match bonus
        }
    });
    
    // Category coherence bonus: C(Q) = ⌊confidence(Q) × 10⌋
    if (questionCategory.confidence > 0.7) {
        score += Math.floor(questionCategory.confidence * 10);
    }
    
    return {
        score,
        category: questionCategory,
        details: {
            properNounMatches,
            nounMatches,
            verbMatches,
            subjectMatches,
            shortResponseMatches,
            actionMatches,
            directMatches
        }
    };
}

// Main function to find the best matching answer for a question
function findBestAnswer(question, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds) {
    let bestAnswer = "";
    let highestScore = 0;
    let bestDetails = {};
    
    answerArray.forEach(answer => {
        const result = calculateScore(question, answer, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
        
        if (result.score > highestScore) {
            highestScore = result.score;
            bestAnswer = answer;
            bestDetails = result.details;
        }
    });
    
    return {
        question,
        bestAnswer,
        score: highestScore,
        confidence: Math.min(highestScore / 10, 1), // Normalize to 0-1 range
        details: bestDetails
    };
}

/**
 * Find All Relevant Answers (Many-to-Many Algorithm Extension)
 * 
 * Returns multiple answers that meet minimum similarity threshold
 * Supports one question → multiple answers relationship
 * 
 * @param {string} question - The input question
 * @param {Array} answerArray - Array of possible answers
 * @param {number} minThreshold - Minimum similarity score (default: 5)
 * @param {number} maxResults - Maximum number of results (default: 5)
 * @returns {Array} Sorted array of matching answers with confidence scores
 */
function findAllRelevantAnswers(question, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds, minThreshold = 5, maxResults = 5) {
    const allMatches = [];
    
    answerArray.forEach(answer => {
        const result = calculateScore(question, answer, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
        
        // Only include answers above minimum threshold
        if (result.score >= minThreshold) {
            allMatches.push({
                answer: answer,
                score: result.score,
                confidence: Math.min(result.score / 10, 1), // Normalize to 0-1 range
                details: result.details,
                relevanceLevel: result.score >= 15 ? 'high' : result.score >= 10 ? 'medium' : 'low'
            });
        }
    });
    
    // Sort by score (descending) and limit results
    return allMatches
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map((match, index) => ({
            ...match,
            rank: index + 1,
            question: question
        }));
}

/**
 * Reverse Lookup: Find Questions for Answer (Many-to-Many Extension)
 * 
 * Given an answer, find all questions that could lead to it
 * Supports one answer → multiple questions relationship
 * 
 * @param {string} targetAnswer - The answer to find questions for
 * @param {Array} questionArray - Array of possible questions
 * @param {number} minThreshold - Minimum similarity score (default: 5)
 * @returns {Array} Questions that could lead to this answer
 */
function findQuestionsForAnswer(targetAnswer, questionArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds, minThreshold = 5) {
    const matchingQuestions = [];
    
    questionArray.forEach(question => {
        const result = calculateScore(question, targetAnswer, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
        
        if (result.score >= minThreshold) {
            matchingQuestions.push({
                question: question,
                score: result.score,
                confidence: Math.min(result.score / 10, 1),
                details: result.details,
                targetAnswer: targetAnswer
            });
        }
    });
    
    return matchingQuestions.sort((a, b) => b.score - a.score);
}

// Function to process multiple questions against multiple answers
function processQuestionAnswerPairs(questionArray, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds) {
    return questionArray.map(question => 
        findBestAnswer(question, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds)
    );
}

/**
 * Many-to-Many Question-Answer Processing
 * 
 * Processes multiple questions and finds all relevant answers for each
 * Creates comprehensive mapping of questions to multiple valid answers
 * 
 * @param {Array} questionArray - Array of questions to process
 * @param {Array} answerArray - Array of possible answers
 * @param {Object} options - Processing options {minThreshold, maxAnswers, includeReverse}
 * @returns {Object} Complete many-to-many mapping results
 */
function processMultipleAnswers(questionArray, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds, options = {}) {
    const {
        minThreshold = 5,
        maxAnswers = 5,
        includeReverse = false
    } = options;
    
    const questionToAnswers = questionArray.map(question => ({
        question: question,
        matches: findAllRelevantAnswers(
            question, 
            answerArray, 
            nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds,
            minThreshold, 
            maxAnswers
        )
    }));
    
    const results = {
        questionToAnswers: questionToAnswers,
        summary: {
            totalQuestions: questionArray.length,
            questionsWithMatches: questionToAnswers.filter(q => q.matches.length > 0).length,
            questionsWithMultipleMatches: questionToAnswers.filter(q => q.matches.length > 1).length,
            averageMatchesPerQuestion: questionToAnswers.reduce((sum, q) => sum + q.matches.length, 0) / questionArray.length
        }
    };
    
    // Optional: Include reverse mapping (answer → questions)
    if (includeReverse) {
        const answerToQuestions = answerArray.map(answer => ({
            answer: answer,
            matchingQuestions: findQuestionsForAnswer(
                answer, 
                questionArray, 
                nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds,
                minThreshold
            )
        }));
        
        results.answerToQuestions = answerToQuestions;
        results.summary.totalAnswers = answerArray.length;
        results.summary.answersWithMatches = answerToQuestions.filter(a => a.matchingQuestions.length > 0).length;
        results.summary.answersWithMultipleMatches = answerToQuestions.filter(a => a.matchingQuestions.length > 1).length;
    }
    
    return results;
}

/**
 * Format Multiple Answers for Different Input Types
 * 
 * Takes multiple answer matches and formats them appropriately
 * for different UI input types (radio, dropdown, checkbox, text)
 */
function formatMultipleAnswerResponse(matches, inputType, options = {}) {
    const {
        combineAnswers = true,
        includeConfidence = true,
        maxLength = 200
    } = options;
    
    if (!matches || matches.length === 0) {
        return { formattedResponse: "No suitable answers found", inputType, matches: [] };
    }
    
    switch (inputType) {
        case inputTypes.RADIO:
            // For radio buttons, provide the top match but show alternatives
            return {
                formattedResponse: matches[0].answer,
                primaryChoice: matches[0].answer,
                alternatives: matches.slice(1).map(m => m.answer),
                confidence: matches[0].confidence,
                inputType,
                matches
            };
            
        case inputTypes.DROPDOWN:
            // For dropdown, list all options with primary selection
            return {
                formattedResponse: matches[0].answer,
                dropdownOptions: matches.map(m => ({
                    value: m.answer,
                    label: m.answer,
                    confidence: m.confidence,
                    selected: m.rank === 1
                })),
                inputType,
                matches
            };
            
        case inputTypes.CHECKBOX:
            // For checkboxes, user can select multiple relevant answers
            return {
                formattedResponse: matches.map(m => m.answer).join("; "),
                checkboxOptions: matches.map(m => ({
                    value: m.answer,
                    label: m.answer,
                    confidence: m.confidence,
                    checked: m.relevanceLevel === 'high'
                })),
                inputType,
                matches
            };
            
        case inputTypes.TEXT:
        default:
            // For text input, combine or list multiple answers
            if (combineAnswers && matches.length > 1) {
                const combined = matches
                    .filter(m => m.relevanceLevel !== 'low')
                    .map(m => includeConfidence ? 
                        `${m.answer} (${Math.round(m.confidence * 100)}% match)` : 
                        m.answer
                    )
                    .join(" | ");
                    
                return {
                    formattedResponse: combined.length > maxLength ? 
                        combined.substring(0, maxLength) + "..." : 
                        combined,
                    inputType,
                    matches,
                    combinedAnswer: true
                };
            } else {
                return {
                    formattedResponse: matches[0].answer,
                    alternatives: matches.slice(1),
                    inputType,
                    matches
                };
            }
    }
}

// Input type definitions and their answer formats
const inputTypes = {
    TEXT: 'text',
    RADIO: 'radio', 
    DROPDOWN: 'dropdown',
    CHECKBOX: 'checkbox'
};

// Dynamic response data storage
let storedResponses = new Map(); // Store user responses for consistency
let questionCategories = new Map(); // Store categorized questions
let answerPatterns = new Map(); // Store answer patterns for reuse

// Dynamic category detection based on keywords
function detectQuestionCategory(question, propernouns, nouns, verbs) {
    const lowerQ = question.toLowerCase();
    const words = lowerQ.split(/\s+/);
    
    let category = 'general';
    let confidence = 0;
    
    // Check for specific technologies/certifications in propernouns
    const techWords = propernouns.filter(prop => 
        words.some(word => prop.toLowerCase().includes(word) || word.includes(prop.toLowerCase()))
    );
    
    // Check for experience/time-related words
    const experienceWords = ['year', 'years', 'experience', 'month', 'months'];
    const hasExperience = words.some(word => experienceWords.includes(word));
    
    // Check for yes/no question patterns
    const yesNoWords = ['do', 'are', 'have', 'can', 'will', 'would', 'is'];
    const isYesNo = words.some(word => yesNoWords.includes(word));
    
    if (techWords.length > 0) {
        category = hasExperience ? `${techWords[0]}_experience` : `${techWords[0]}_knowledge`;
        confidence = 0.8;
    } else if (hasExperience) {
        category = 'experience_general';
        confidence = 0.6;
    } else if (isYesNo) {
        category = 'yes_no_question';
        confidence = 0.5;
    }
    
    return { category, confidence, detectedTerms: techWords };
}

// Generate dynamic response based on answer content and input type
function generateDynamicResponse(answer, inputType, userShortResponce, actionWorkds) {
    const lowerAnswer = answer.toLowerCase();
    
    switch (inputType) {
        case 'radio':
            // Extract key info for radio buttons
            if (lowerAnswer.includes('yes')) return 'Yes';
            if (lowerAnswer.includes('no')) return 'No';
            if (lowerAnswer.match(/\d+\s*years?/)) {
                const years = lowerAnswer.match(/(\d+)\s*years?/)[1];
                return `${years} years`;
            }
            // Use userShortResponce for concise answers
            const shortResponse = userShortResponce.find(resp => 
                lowerAnswer.includes(resp.toLowerCase())
            );
            return shortResponse || answer.split('.')[0]; // First sentence
            
        case 'dropdown':
            // More descriptive for dropdowns
            if (lowerAnswer.match(/\d+\s*years?.*experience/)) {
                const years = lowerAnswer.match(/(\d+)\s*years?/)[1];
                const tech = extractTechnology(answer);
                return tech ? `${years} years - ${tech}` : `${years} years experience`;
            }
            return answer.length > 50 ? answer.substring(0, 47) + '...' : answer;
            
        case 'checkbox':
            // Boolean or action-based for checkboxes
            const hasAction = actionWorkds.some(action => 
                lowerAnswer.includes(action.toLowerCase())
            );
            if (hasAction) return true;
            return lowerAnswer.includes('yes') || lowerAnswer.includes('have') || 
                   lowerAnswer.includes('can') || !lowerAnswer.includes('no');
            
        default: // text
            return answer;
    }
}

// Extract technology/skill names from text
function extractTechnology(text) {
    const commonTech = ['javascript', 'python', 'java', 'react', 'node', 'aws', 'sql', 'css', 'html'];
    const words = text.toLowerCase().split(/\s+/);
    return commonTech.find(tech => words.some(word => word.includes(tech)));
}

// Enhanced matching function that handles input types dynamically
function findAnswerWithInputType(question, answerArray, inputType, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds) {
    // First find the best semantic match
    const baseResult = findBestAnswer(question, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
    
    // Generate dynamic response based on answer content and input type
    const formattedAnswer = generateDynamicResponse(baseResult.bestAnswer, inputType, userShortResponce, actionWorkds);
    
    // Store this response for consistency across similar questions
    const questionKey = question.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (!storedResponses.has(questionKey)) {
        storedResponses.set(questionKey, {
            originalAnswer: baseResult.bestAnswer,
            formattedResponses: { [inputType]: formattedAnswer },
            category: baseResult.category
        });
    } else {
        // Update with new input type response
        const stored = storedResponses.get(questionKey);
        stored.formattedResponses[inputType] = formattedAnswer;
    }
    
    return {
        ...baseResult,
        inputType,
        formattedAnswer,
        originalAnswer: baseResult.bestAnswer,
        isConsistent: checkResponseConsistency(questionKey, inputType, formattedAnswer)
    };
}

// Check if response is consistent with previous responses to similar questions
function checkResponseConsistency(questionKey, inputType, newResponse) {
    const stored = storedResponses.get(questionKey);
    if (!stored) return true;
    
    // Check if the core meaning is consistent across input types
    const responses = Object.values(stored.formattedResponses);
    if (responses.length === 0) return true;
    
    // Simple consistency check - look for contradictions
    const hasYes = responses.some(r => String(r).toLowerCase().includes('yes') || r === true);
    const hasNo = responses.some(r => String(r).toLowerCase().includes('no') || r === false);
    
    const newHasYes = String(newResponse).toLowerCase().includes('yes') || newResponse === true;
    const newHasNo = String(newResponse).toLowerCase().includes('no') || newResponse === false;
    
    // Flag inconsistency if yes/no conflicts
    return !(hasYes && newHasNo) && !(hasNo && newHasYes);
}

// Batch process with input types
function processWithInputTypes(questionArray, answerArray, inputTypeArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds) {
    return questionArray.map((question, index) => {
        const inputType = inputTypeArray[index] || inputTypes.TEXT;
        return findAnswerWithInputType(question, answerArray, inputType, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
    });
}

// Data storage and retrieval functions
function saveResponseData(filename = 'responses.json') {
    // Convert Maps to serializable objects with full details
    const serializedResponses = Array.from(storedResponses.entries()).map(([question, data]) => ({
        question,
        originalAnswer: data.originalAnswer,
        formattedResponses: data.formattedResponses,
        category: data.category || null
    }));
    
    const data = {
        storedResponses: serializedResponses,
        questionCategories: Array.from(questionCategories.entries()),
        answerPatterns: Array.from(answerPatterns.entries()),
        totalQuestions: storedResponses.size,
        timestamp: new Date().toISOString()
    };
    
    // In a real implementation, you'd save to file
    console.log(`\nData would be saved to ${filename}:`);
    console.log(JSON.stringify(data, null, 2));
    return data;
}

function loadResponseData(data) {
    if (data.storedResponses) {
        storedResponses = new Map(data.storedResponses);
    }
    if (data.questionCategories) {
        questionCategories = new Map(data.questionCategories);
    }
    if (data.answerPatterns) {
        answerPatterns = new Map(data.answerPatterns);
    }
    console.log('Data loaded successfully');
}

// Get all stored responses for analysis
function getStoredResponses() {
    return {
        totalQuestions: storedResponses.size,
        responses: Array.from(storedResponses.entries()),
        categories: Array.from(questionCategories.entries())
    };
}

// Find similar questions that have been answered before
function findSimilarQuestions(newQuestion, threshold = 0.6) {
    const similar = [];
    
    for (const [storedQ, data] of storedResponses.entries()) {
        const similarity = calculateTextSimilarity(newQuestion.toLowerCase(), storedQ);
        if (similarity > threshold) {
            similar.push({
                question: storedQ,
                similarity,
                storedData: data
            });
        }
    }
    
    return similar.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Jaccard Similarity Index
 * Formula: J(A,B) = |A ∩ B| / |A ∪ B|
 * Range: [0,1] where 1 = identical, 0 = no similarity
 */
function calculateTextSimilarity(text1, text2) {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size; // |A ∩ B| / |A ∪ B|
}


// Comprehensive test data organized by categories
const testQuestions = [
    // 🚛 Trucking / License Questions
    "Do you have a valid Class A license?",
    "Are you currently licensed to drive commercial vehicles with Class A?",
    "How many years have you been driving with a Class A CDL?",
    
    // 💻 Tech Experience
    "How many years of JavaScript experience do you have?",
    "Have you worked professionally with JavaScript, and if so for how long?",
    "Rate your JavaScript proficiency and years of use.",
    
    // 🗣 Certification & Credentials
    "Do you currently hold a CompTIA Security+ certification?",
    "Have you obtained your AWS Solutions Architect Associate certification?",
    "Which certifications do you currently hold in IT security?",
    
    // 🕒 Availability
    "Are you available to work full-time?",
    "Would you be open to part-time or contract work?",
    "How soon can you start working if hired?",
    
    // 📍 Location / Relocation
    "Are you authorized to work in the United States?",
    "Do you require visa sponsorship now or in the future?",
    "Would you be willing to relocate for this role?",
    
    // 🎓 Education / Training
    "Do you have a high school diploma or GED?",
    "What is your highest level of education completed?",
    "Have you completed any technical bootcamps or training programs?",
    
    // ⚙️ Skills (general)
    "How many years of experience do you have with Python?",
    "Do you have backend development experience with Node.js?",
    "Have you worked with cloud platforms like AWS or Azure?",
    
    // 🧰 Soft Skills / Extras
    "Do you have leadership or management experience?",
    "Are you comfortable training or mentoring junior staff?",
    "Do you have experience working in agile or scrum environments?",
    
    // 🏗 Extra Variations (to test paraphrasing)
    "Have you worked as a professional truck driver with a CDL?",
    "Are you certified or licensed to operate commercial trucks?",
    "How many years of professional coding experience do you have overall?",
    "Do you currently hold any active technical certifications?",
    "What's your availability for starting a new position?",
    "Can you commit to 40 hours per week?"
];

const testAnswers = [
    // 🚛 Trucking / License Answers
    "Yes, I have a Class A license.",
    "Yes, I hold a Class A license.",
    "3 years of Class A CDL experience.",
    
    // 💻 Tech Experience Answers
    "2 years of JavaScript experience.",
    "2 years of professional JavaScript experience.",
    "Intermediate, 2 years of experience.",
    
    // 🗣 Certification & Credentials Answers
    "Yes, I am Security+ certified.",
    "Yes, AWS Solutions Architect Associate certified.",
    "CompTIA Security+, AWS Solutions Architect Associate.",
    
    // 🕒 Availability Answers
    "Yes, available full-time.",
    "Yes, open to part-time or contract roles.",
    "Available to start immediately.",
    
    // 📍 Location / Relocation Answers
    "Yes, authorized to work in the U.S.",
    "No, I do not require sponsorship.",
    "Yes, willing to relocate.",
    
    // 🎓 Education / Training Answers
    "Yes, I have a high school diploma.",
    "Completed Software Engineering program (equivalent to college-level training).",
    "Yes, completed Per Scholas Software Engineering program.",
    
    // ⚙️ Skills (general) Answers
    "3 years of Python experience.",
    "Yes, backend experience with Node.js.",
    "Yes, AWS experience.",
    
    // 🧰 Soft Skills / Extras Answers
    "Yes, led a small development team.",
    "Yes, experienced in mentoring teammates.",
    "Yes, experienced with Agile/Scrum.",
    
    // 🏗 Extra Variations Answers
    "Yes, 3 years Class A CDL experience.",
    "Yes, licensed Class A CDL.",
    "4 years of coding experience.",
    "Yes, Security+ and AWS Solutions Architect Associate.",
    "Available immediately.",
    "Yes, full-time availability."
];

// Test the system
console.log("=== Question-Answer Matching System Test ===\n");

testQuestions.forEach((question, index) => {
    const result = findBestAnswer(question, testAnswers, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
    
    console.log(`Question ${index + 1}: ${question}`);
    console.log(`Best Answer: ${result.bestAnswer}`);
    console.log(`Score: ${result.score}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`Matches: ${JSON.stringify(result.details, null, 2)}`);
    console.log("---");
});

// Batch processing test
console.log("\n=== Batch Processing Test ===");
const batchResults = processQuestionAnswerPairs(testQuestions.slice(0, 5), testAnswers, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
batchResults.forEach((result, index) => {
    console.log(`${index + 1}. Q: "${result.question}"`);
    console.log(`   A: "${result.bestAnswer}" (Score: ${result.score})`);
});

// Input type consistency test
console.log("\n=== Input Type Consistency Test ===");
const testQuestion = "Do you have a valid Class A license?";
const inputTypesTest = [inputTypes.TEXT, inputTypes.RADIO, inputTypes.DROPDOWN, inputTypes.CHECKBOX];

inputTypesTest.forEach(type => {
    const result = findAnswerWithInputType(testQuestion, testAnswers, type, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
    console.log(`${type.toUpperCase()}: ${result.formattedAnswer}`);
});

// Batch test with different input types
console.log("\n=== Mixed Input Types Test ===");
const mixedInputTypes = [inputTypes.TEXT, inputTypes.RADIO, inputTypes.DROPDOWN, inputTypes.TEXT, inputTypes.RADIO];
const mixedResults = processWithInputTypes(testQuestions.slice(0, 5), testAnswers, mixedInputTypes, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);

mixedResults.forEach((result, index) => {
    console.log(`${index + 1}. [${result.inputType.toUpperCase()}] Q: "${result.question}"`);
    console.log(`   Formatted A: "${result.formattedAnswer}"`);
    console.log(`   Original A: "${result.originalAnswer}"`);
    console.log(`   Category: ${result.responseCategory || 'general'}`);
});

// Data Storage Test
console.log("\n=== Data Storage Test ===");
const newQuestion = "Do you currently have AWS certification?";
const newResult = findAnswerWithInputType(newQuestion, testAnswers, 'radio', nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
console.log(`New Question: ${newQuestion}`);
console.log(`Answer: ${newResult.formattedAnswer}`);
console.log(`Consistent: ${newResult.isConsistent}`);

// Show stored data
console.log("\n=== Stored Response Data ===");
const storedData = getStoredResponses();
console.log(`Total stored questions: ${storedData.totalQuestions}`);
storedData.responses.slice(0, 5).forEach(([key, data], index) => {
    console.log(`\n${index + 1}. Question: "${key}"`);
    console.log(`   Original Answer: "${data.originalAnswer}"`);
    console.log(`   Formatted Responses:`);
    Object.entries(data.formattedResponses).forEach(([inputType, response]) => {
        console.log(`     ${inputType}: "${response}"`);
    });
    if (data.category) {
        console.log(`   Category: ${data.category.category} (confidence: ${(data.category.confidence * 100).toFixed(1)}%)`);
    }
});

// Similar questions test
console.log("\n=== Similar Questions Test ===");
const similarQuestions = findSimilarQuestions("Do you possess a Class A driving license?", 0.4);
console.log("Similar questions found:", similarQuestions.length);
similarQuestions.slice(0, 2).forEach((similar, index) => {
    console.log(`${index + 1}. "${similar.question}" (similarity: ${(similar.similarity * 100).toFixed(1)}%)`);
});

// Save data demonstration
console.log("\n=== Save Data Demo ===");
const savedData = saveResponseData('test_responses.json');
console.log(`Saved ${savedData.storedResponses.length} responses`);

// Single test case
console.log("\n=== Single Test Case ===");
const singleResult = findBestAnswer(
    "Do you have a valid Class A license", 
    testAnswers, 
    nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds
);
console.log("Result:", singleResult);

const jobqustions = findAnswerWithInputType(newQuestion, testAnswers, 'radio', nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);

// ===================================================
// MANY-TO-MANY RELATIONSHIP DEMONSTRATIONS
// ===================================================

console.log("\n" + "=".repeat(80));
console.log("🔄 MANY-TO-MANY ALGORITHM DEMONSTRATIONS");
console.log("=".repeat(80));

// Test 1: One Question → Multiple Relevant Answers
console.log("\n📋 TEST 1: Finding Multiple Answers for One Question");
console.log("─".repeat(60));

const questionWithMultipleAnswers = "What qualifications do you have?";
console.log(`Question: "${questionWithMultipleAnswers}"`);

const multipleAnswers = findAllRelevantAnswers(
    questionWithMultipleAnswers, 
    testAnswers, 
    nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds,
    3,  // minimum threshold
    6   // max results
);

console.log(`\nFound ${multipleAnswers.length} relevant answers:`);
multipleAnswers.forEach((match, i) => {
    console.log(`  ${i+1}. [Score: ${match.score}, ${match.relevanceLevel.toUpperCase()}] ${match.answer}`);
    console.log(`     Confidence: ${Math.round(match.confidence * 100)}%`);
});

// Test 2: Format Multiple Answers for Different Input Types
console.log("\n🎛️ TEST 2: Formatting for Different Input Types");
console.log("─".repeat(60));

const inputTypesToTest = ['text', 'radio', 'dropdown', 'checkbox'];
inputTypesToTest.forEach(inputType => {
    const formatted = formatMultipleAnswerResponse(multipleAnswers, inputType);
    console.log(`\n${inputType.toUpperCase()} Format:`);
    console.log(`  Primary Response: ${formatted.formattedResponse}`);
    
    if (formatted.alternatives) {
        console.log(`  Alternatives: ${formatted.alternatives.length} options`);
    }
    if (formatted.dropdownOptions) {
        console.log(`  Dropdown Options: ${formatted.dropdownOptions.length} choices`);
    }
    if (formatted.checkboxOptions) {
        console.log(`  Checkbox Options: ${formatted.checkboxOptions.length} selectable`);
    }
});

// Test 3: Comprehensive Many-to-Many Processing
console.log("\n🔄 TEST 3: Full Many-to-Many Processing");
console.log("─".repeat(60));

const questionsForManyToMany = [
    "Do you have truck driving experience?",
    "What certifications do you hold?", 
    "Are you available for work?",
    "What's your education background?",
    "Where are you located?"
];

const manyToManyResults = processMultipleAnswers(
    questionsForManyToMany, 
    testAnswers, 
    nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds,
    { 
        minThreshold: 4, 
        maxAnswers: 4, 
        includeReverse: true 
    }
);

console.log(`\nProcessed ${manyToManyResults.summary.totalQuestions} questions:`);
console.log(`✅ Questions with matches: ${manyToManyResults.summary.questionsWithMatches}`);
console.log(`🔢 Questions with multiple matches: ${manyToManyResults.summary.questionsWithMultipleMatches}`);
console.log(`📊 Average matches per question: ${manyToManyResults.summary.averageMatchesPerQuestion.toFixed(2)}`);

manyToManyResults.questionToAnswers.forEach(qa => {
    if (qa.matches.length > 0) {
        console.log(`\nQ: "${qa.question}"`);
        console.log(`   → ${qa.matches.length} answer(s):`);
        qa.matches.forEach(match => {
            console.log(`     • ${match.answer} (${Math.round(match.confidence * 100)}%)`);
        });
    }
});

// Test 4: Reverse Lookup (Answer → Questions)
console.log("\n🔍 TEST 4: Reverse Lookup - Answer to Questions");
console.log("─".repeat(60));

if (manyToManyResults.answerToQuestions) {
    console.log(`\nProcessed ${manyToManyResults.summary.totalAnswers} answers:`);
    console.log(`✅ Answers with matches: ${manyToManyResults.summary.answersWithMatches}`);
    console.log(`🔢 Answers with multiple matches: ${manyToManyResults.summary.answersWithMultipleMatches}`);
    
    manyToManyResults.answerToQuestions
        .filter(aq => aq.matchingQuestions.length > 1)  // Only show answers with multiple question matches
        .slice(0, 3)  // Show top 3 examples
        .forEach(aq => {
            console.log(`\nA: "${aq.answer}"`);
            console.log(`   ← ${aq.matchingQuestions.length} question(s) lead to this:`);
            aq.matchingQuestions.forEach(match => {
                console.log(`     • "${match.question}" (${Math.round(match.confidence * 100)}%)`);
            });
        });
}

// Test 5: Edge Cases and Performance
console.log("\n⚡ TEST 5: Edge Cases and Performance Analysis");
console.log("─".repeat(60));

const edgeQuestions = [
    "Tell me everything about trucking",  // Broad question
    "CDL",  // Very short question
    "Do you have experience with JavaScript programming and machine learning?",  // Outside domain
    ""  // Empty question
];

console.log("\nEdge case analysis:");
edgeQuestions.forEach(question => {
    if (question === "") {
        console.log(`Empty question → Skipped`);
        return;
    }
    
    const results = findAllRelevantAnswers(
        question, 
        testAnswers, 
        nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds,
        2  // Lower threshold for edge cases
    );
    
    console.log(`"${question}"`);
    console.log(`  → Found ${results.length} matches (threshold ≥ 2)`);
    if (results.length > 0) {
        const topMatch = results[0];
        console.log(`  → Best: "${topMatch.answer}" (score: ${topMatch.score})`);
    }
});

// Test 6: Save Many-to-Many Results
console.log("\n💾 TEST 6: Saving Many-to-Many Data");
console.log("─".repeat(60));

console.log("\nSaving comprehensive many-to-many results...");
manyToManyResults.questionToAnswers.slice(0, 3).forEach(qa => {
    if (qa.matches.length > 0) {
        const response = {
            question: qa.question,
            multipleAnswers: qa.matches,
            timestamp: new Date().toISOString(),
            algorithmType: "many-to-many-weighted-similarity"
        };
        
        const serialized = {
            question: response.question,
            answerCount: response.multipleAnswers.length,
            answers: response.multipleAnswers.map(m => ({
                text: m.answer,
                score: m.score,
                confidence: Math.round(m.confidence * 100),
                relevance: m.relevanceLevel,
                rank: m.rank
            })),
            metadata: {
                timestamp: response.timestamp,
                algorithm: response.algorithmType
            }
        };
        
        console.log(`\n📄 Saved Response:`, JSON.stringify(serialized, null, 2));
    }
});

console.log("\n" + "=".repeat(80));
console.log("✅ MANY-TO-MANY DEMONSTRATION COMPLETE");
console.log("🎯 The algorithm now supports:");
console.log("   • One question → Multiple relevant answers");
console.log("   • One answer ← Multiple related questions"); 
console.log("   • Confidence scoring for all matches");
console.log("   • Input-type specific formatting");
console.log("   • Comprehensive data serialization");
console.log("=".repeat(80));

























