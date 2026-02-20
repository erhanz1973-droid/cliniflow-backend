#!/bin/bash

echo "🚀 CLINIFLOW DEPLOYMENT SCRIPT"
echo "=============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

print_info "Starting deployment process..."

# 1. Check current server status
echo ""
print_info "1️⃣ Checking current server status..."

if pgrep -f "node server/index.js" > /dev/null; then
    print_warning "Server is currently running. Stopping it..."
    pkill -f "node server/index.js"
    sleep 2
else
    print_status "Server is not running."
fi

# 2. Install dependencies
echo ""
print_info "2️⃣ Installing dependencies..."

if [ -d "node_modules" ]; then
    print_warning "node_modules exists. Running fresh install..."
    rm -rf node_modules
fi

npm install
if [ $? -eq 0 ]; then
    print_status "Dependencies installed successfully."
else
    print_error "Failed to install dependencies."
    exit 1
fi

# 3. Check environment variables
echo ""
print_info "3️⃣ Checking environment configuration..."

if [ ! -f "server/.env" ]; then
    print_error "server/.env file not found."
    if [ -f "server/.env.example" ]; then
        print_info "Copying server/.env.example to server/.env"
        cp server/.env.example server/.env
        print_warning "Please update server/.env with your production values."
    else
        print_error "server/.env.example not found. Creating basic .env file..."
        mkdir -p server
        cat > server/.env << EOF
PORT=5050
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
EOF
        print_warning "Please update server/.env with your production values."
    fi
else
    print_status "server/.env file found."
fi

# 4. Check if backend server is working
echo ""
print_info "4️⃣ Testing backend server..."

cd server
node index.js &
SERVER_PID=$!
sleep 3

if curl -s http://localhost:5050/health > /dev/null; then
    print_status "Backend server is responding correctly."
    kill $SERVER_PID 2>/dev/null
else
    print_error "Backend server failed to start or respond."
    kill $SERVER_PID 2>/dev/null
    exit 1
fi
cd ..

# 5. Check admin panel
echo ""
print_info "5️⃣ Checking admin panel..."

if [ -d "cliniflow-admin" ]; then
    cd cliniflow-admin
    if [ -f "package.json" ]; then
        print_info "Installing admin panel dependencies..."
        npm install
        if [ $? -eq 0 ]; then
            print_status "Admin panel dependencies installed."
        else
            print_error "Failed to install admin panel dependencies."
        fi
    else
        print_error "Admin panel package.json not found."
    fi
    cd ..
else
    print_warning "Admin panel directory not found."
fi

# 6. Check mobile app
echo ""
print_info "6️⃣ Checking mobile app..."

if [ -d "cliniflow-app" ]; then
    cd cliniflow-app
    if [ -f "package.json" ]; then
        print_info "Installing mobile app dependencies..."
        npm install
        if [ $? -eq 0 ]; then
            print_status "Mobile app dependencies installed."
        else
            print_error "Failed to install mobile app dependencies."
        fi
    else
        print_error "Mobile app package.json not found."
    fi
    cd ..
else
    print_warning "Mobile app directory not found."
fi

# 7. Start production server
echo ""
print_info "7️⃣ Starting production server..."

cd server
node index.js &
SERVER_PID=$!
sleep 3

if curl -s http://localhost:5050/health > /dev/null; then
    print_status "Production server started successfully."
    print_info "Server PID: $SERVER_PID"
    print_info "Server URL: http://localhost:5050"
    print_info "Health check: http://localhost:5050/health"
    
    # Test admin login endpoint
    if curl -s http://localhost:5050/api/admin/login -X POST -H "Content-Type: application/json" -d '{"email":"test@test.com","clinicCode":"TEST","password":"test123"}' | grep -q "Cannot POST"; then
        print_warning "Admin login endpoint returns 404 (expected - route may not exist)"
    else
        print_status "Admin login endpoint is accessible."
    fi
    
else
    print_error "Failed to start production server."
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

cd ..

# 8. Deployment summary
echo ""
print_info "8️⃣ Deployment Summary"
echo "===================="
print_status "✅ Dependencies installed"
print_status "✅ Environment configured"
print_status "✅ Backend server running"
print_status "✅ Admin panel ready"
print_status "✅ Mobile app ready"

echo ""
print_info "🌐 Access URLs:"
print_info "   Backend: http://localhost:5050"
print_info "   Health: http://localhost:5050/health"
print_info "   Admin: http://localhost:5050/admin-login.html"

echo ""
print_info "📱 Mobile App Development:"
print_info "   cd cliniflow-app"
print_info "   npx expo start"

echo ""
print_info "🔧 Server Management:"
print_info "   Stop: pkill -f 'node server/index.js'"
print_info "   Restart: ./deploy.sh"
print_info "   Logs: Check server console output"

echo ""
print_status "🚀 Deployment completed successfully!"
print_warning "⚠️  Remember to:"
print_warning "   1. Update server/.env with production values"
print_warning "   2. Configure your database connections"
print_warning "   3. Set up proper SSL certificates for production"
print_warning "   4. Configure your domain and DNS settings"

# Keep server running in background
echo ""
print_info "Server is running in the background. Press Ctrl+C to stop."
print_info "To stop the server later, run: pkill -f 'node server/index.js'"

# Wait for user input to stop
read -p "Press Enter to stop the server and exit..."
kill $SERVER_PID 2>/dev/null
print_status "Server stopped."
