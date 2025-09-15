#!/bin/bash
# 🛠️ JavaScript Project Debug Toolkit
# Usage: ./debug-toolkit.sh [command] [file/directory]

show_help() {
    echo "🔧 JavaScript Debug Toolkit"
    echo "=========================="
    echo "Commands:"
    echo "  syntax <file>         - Check JavaScript syntax"
    echo "  duplicates <file>     - Find duplicate functions"
    echo "  analyze <file>        - Complete file analysis"
    echo "  errors <file>         - Find common error patterns"
    echo "  complexity <file>     - Calculate code complexity"
    echo "  clean-check <dir>     - Check all JS files in directory"
    echo ""
    echo "Examples:"
    echo "  ./debug-toolkit.sh syntax content.js"
    echo "  ./debug-toolkit.sh analyze src/"
    echo "  ./debug-toolkit.sh duplicates *.js"
}

check_syntax() {
    echo "🔍 Checking syntax for: $1"
    if node -c "$1" 2>/dev/null; then
        echo "✅ Syntax OK"
    else
        echo "❌ Syntax errors found:"
        node -c "$1"
    fi
}

find_duplicates() {
    echo "🔍 Looking for duplicate functions in: $1"
    echo "======================================"
    
    # Find duplicate function names
    duplicates=$(grep -n "^function\|^async function" "$1" 2>/dev/null | \
    sed 's/^[0-9]*://g' | \
    sed 's/function //' | sed 's/async //' | \
    sed 's/(.*$//' | \
    sort | uniq -c | \
    awk '$1 > 1 {print $2}')
    
    if [ -z "$duplicates" ]; then
        echo "✅ No duplicate functions found"
    else
        echo "⚠️  Duplicate functions detected:"
        while IFS= read -r func; do
            echo "   🔴 Function '$func' appears multiple times:"
            grep -n "function $func\|async function $func" "$1" | \
            sed 's/^/      Line /'
        done <<< "$duplicates"
    fi
}

analyze_file() {
    echo "📊 Analyzing: $1"
    echo "================"
    
    # Basic stats
    lines=$(wc -l < "$1")
    size=$(du -h "$1" | cut -f1)
    
    # Function counts
    total_functions=$(grep -c "^function\|^async function" "$1" 2>/dev/null || echo "0")
    async_functions=$(grep -c "^async function" "$1" 2>/dev/null || echo "0")
    regular_functions=$((total_functions - async_functions))
    
    # Variable declarations
    let_vars=$(grep -c "let " "$1" 2>/dev/null || echo "0")
    const_vars=$(grep -c "const " "$1" 2>/dev/null || echo "0")
    var_vars=$(grep -c "var " "$1" 2>/dev/null || echo "0")
    
    # Comments
    single_comments=$(grep -c "//" "$1" 2>/dev/null || echo "0")
    multi_comments=$(grep -c "/\*" "$1" 2>/dev/null || echo "0")
    
    echo "📈 File Statistics:"
    echo "   Lines of code: $lines"
    echo "   File size: $size"
    echo ""
    echo "🔧 Function Analysis:"
    echo "   Total functions: $total_functions"
    echo "   Async functions: $async_functions"
    echo "   Regular functions: $regular_functions"
    echo ""
    echo "📝 Variable Declarations:"
    echo "   let: $let_vars"
    echo "   const: $const_vars"
    echo "   var: $var_vars"
    echo ""
    echo "💬 Documentation:"
    echo "   Single-line comments: $single_comments"
    echo "   Multi-line comments: $multi_comments"
}

find_common_errors() {
    echo "🚨 Scanning for common error patterns in: $1"
    echo "============================================"
    
    # Syntax error patterns
    echo "🔍 Potential Issues:"
    
    # Missing semicolons (basic check)
    missing_semicolons=$(grep -n "[^;{}]\s*$" "$1" | grep -v "^\s*//\|^\s*/\*\|^\s*\*" | wc -l)
    if [ "$missing_semicolons" -gt 0 ]; then
        echo "   ⚠️  Potential missing semicolons: $missing_semicolons lines"
    fi
    
    # Unused variables (basic pattern)
    unused_vars=$(grep -n "let\|const\|var" "$1" | grep -o "[a-zA-Z_][a-zA-Z0-9_]*" | sort | uniq -c | awk '$1 == 1 {print $2}' | wc -l)
    echo "   📝 Potentially unused variables: $unused_vars"
    
    # Console.log statements (should be removed in production)
    console_logs=$(grep -c "console\.log" "$1" 2>/dev/null || echo "0")
    if [ "$console_logs" -gt 0 ]; then
        echo "   🐛 Console.log statements found: $console_logs (consider removing for production)"
    fi
    
    # TODO/FIXME comments
    todos=$(grep -c "TODO\|FIXME\|BUG\|HACK" "$1" 2>/dev/null || echo "0")
    if [ "$todos" -gt 0 ]; then
        echo "   📋 TODO/FIXME comments: $todos"
        grep -n "TODO\|FIXME\|BUG\|HACK" "$1" | sed 's/^/      /'
    fi
}

calculate_complexity() {
    echo "🧮 Code Complexity Analysis for: $1"
    echo "==================================="
    
    # Cyclomatic complexity indicators
    if_statements=$(grep -c "if\s*(" "$1" 2>/dev/null || echo "0")
    for_loops=$(grep -c "for\s*(" "$1" 2>/dev/null || echo "0")
    while_loops=$(grep -c "while\s*(" "$1" 2>/dev/null || echo "0")
    switch_statements=$(grep -c "switch\s*(" "$1" 2>/dev/null || echo "0")
    try_catch=$(grep -c "try\s*{" "$1" 2>/dev/null || echo "0")
    
    total_complexity=$((if_statements + for_loops + while_loops + switch_statements + try_catch))
    
    echo "📊 Complexity Metrics:"
    echo "   If statements: $if_statements"
    echo "   For loops: $for_loops"
    echo "   While loops: $while_loops"
    echo "   Switch statements: $switch_statements"
    echo "   Try-catch blocks: $try_catch"
    echo ""
    echo "   Total complexity score: $total_complexity"
    
    if [ "$total_complexity" -lt 10 ]; then
        echo "   ✅ Low complexity - Easy to maintain"
    elif [ "$total_complexity" -lt 25 ]; then
        echo "   ⚠️  Medium complexity - Consider refactoring"
    else
        echo "   🔴 High complexity - Refactoring recommended"
    fi
}

clean_check_directory() {
    echo "🔍 Checking all JavaScript files in: $1"
    echo "======================================"
    
    # Find all JavaScript files
    js_files=$(find "$1" -name "*.js" -type f)
    
    if [ -z "$js_files" ]; then
        echo "❌ No JavaScript files found"
        return
    fi
    
    total_files=0
    clean_files=0
    
    while IFS= read -r file; do
        total_files=$((total_files + 1))
        echo ""
        echo "📁 Checking: $file"
        
        if node -c "$file" 2>/dev/null; then
            echo "   ✅ Syntax OK"
            clean_files=$((clean_files + 1))
        else
            echo "   ❌ Syntax errors found"
        fi
        
        # Quick duplicate check
        duplicates=$(grep -n "^function\|^async function" "$file" 2>/dev/null | \
        sed 's/^[0-9]*://g' | sed 's/function //' | sed 's/async //' | \
        sed 's/(.*$//' | sort | uniq -c | awk '$1 > 1' | wc -l)
        
        if [ "$duplicates" -gt 0 ]; then
            echo "   ⚠️  $duplicates duplicate functions found"
        else
            echo "   ✅ No duplicates"
        fi
        
    done <<< "$js_files"
    
    echo ""
    echo "📊 Summary:"
    echo "   Total files checked: $total_files"
    echo "   Clean files: $clean_files"
    echo "   Files with issues: $((total_files - clean_files))"
}

# Main script logic
case "$1" in
    "syntax")
        if [ -z "$2" ]; then
            echo "❌ Please provide a file to check"
            echo "Usage: $0 syntax <filename>"
            exit 1
        fi
        check_syntax "$2"
        ;;
    "duplicates")
        if [ -z "$2" ]; then
            echo "❌ Please provide a file to check"
            echo "Usage: $0 duplicates <filename>"
            exit 1
        fi
        find_duplicates "$2"
        ;;
    "analyze")
        if [ -z "$2" ]; then
            echo "❌ Please provide a file to analyze"
            echo "Usage: $0 analyze <filename>"
            exit 1
        fi
        analyze_file "$2"
        ;;
    "errors")
        if [ -z "$2" ]; then
            echo "❌ Please provide a file to check"
            echo "Usage: $0 errors <filename>"
            exit 1
        fi
        find_common_errors "$2"
        ;;
    "complexity")
        if [ -z "$2" ]; then
            echo "❌ Please provide a file to analyze"
            echo "Usage: $0 complexity <filename>"
            exit 1
        fi
        calculate_complexity "$2"
        ;;
    "clean-check")
        if [ -z "$2" ]; then
            echo "❌ Please provide a directory to check"
            echo "Usage: $0 clean-check <directory>"
            exit 1
        fi
        clean_check_directory "$2"
        ;;
    *)
        show_help
        ;;
esac